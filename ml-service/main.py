import math
import os
import secrets
from pathlib import Path
from typing import Any, Optional, Union

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.core import (
    DEFAULT_FEATURES,
    classify_consistency,
    compute_features,
    flag_rules,
    run_lof,
    run_lof_raw,
)

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

APP_VERSION = "0.1.0"


def get_expected_ml_key() -> str:
    key = os.getenv("ML_API_KEY") or os.getenv("ML_SERVICE_KEY")
    if not key:
        return "lembar-pantau-ml-secret-2026"
    return key


def verify_ml_key(x_ml_key: Optional[str] = Header(default=None, alias="X-ML-KEY")) -> str:
    expected = get_expected_ml_key()
    if not x_ml_key or not secrets.compare_digest(x_ml_key, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header X-ML-KEY tidak valid atau tidak disertakan.",
        )
    return x_ml_key


def _clean_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


class AnalyzeRequest(BaseModel):
    bulan: Optional[list[Union[int, dict[str, Any]]]] = Field(
        default=None,
        description="Daftar nomor bulan (1..10) atau daftar objek laporan bulanan.",
    )
    records: Optional[list[dict[str, Any]]] = Field(
        default=None,
        description="Opsional daftar rekaman laporan bulanan bila dikirim langsung.",
    )
    k: int = Field(default=10, ge=1, le=1000)
    threshold: float = Field(default=1.5, gt=0.0, le=20.0)
    fitur: list[str] = Field(default_factory=lambda: list(DEFAULT_FEATURES))

    @field_validator("fitur")
    @classmethod
    def validate_fitur(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("Daftar fitur tidak boleh kosong.")
        allowed = set(DEFAULT_FEATURES)
        for item in v:
            if item not in allowed:
                raise ValueError(f"Fitur '{item}' tidak dikenal. Pilihan valid: {DEFAULT_FEATURES}")
        return v


class ClassifyRequest(BaseModel):
    riwayat: list[dict[str, Any]] = Field(..., min_length=1)
    threshold: float = Field(default=1.5, gt=0.0, le=20.0)


class LofRawRequest(BaseModel):
    titik: list[list[float]] = Field(..., min_length=2)
    k: int = Field(default=2, ge=1, le=1000)
    threshold: float = Field(default=1.5, gt=0.0, le=20.0)

    @field_validator("titik")
    @classmethod
    def validate_titik(cls, v: list[list[float]]) -> list[list[float]]:
        dim = len(v[0]) if v else 0
        if dim < 1:
            raise ValueError("Setiap titik wajib memiliki minimal 1 dimensi koordinat.")
        for pt in v:
            if len(pt) != dim:
                raise ValueError("Seluruh titik wajib memiliki dimensi koordinat yang sama.")
        return v


app = FastAPI(
    title="Lembar Pantau — Layanan LOF",
    description="Layanan perhitungan Local Outlier Factor (LOF) penyaluran LPG 3 kg Kabupaten Bintan.",
    version=APP_VERSION,
)


@app.get("/health", dependencies=[Depends(verify_ml_key)])
def health_check() -> dict[str, Any]:
    data_dir = Path(os.getenv("DATA_DIR", str(BASE_DIR.parent / "data"))).resolve()
    required_files = [
        "kjp_2026_wide.csv",
        "kjp_2026_lof_per_bulan.csv",
        "kjp_2026_klasifikasi_pangkalan.csv",
        "usulan_pemetaan_kecamatan.csv",
        "evaluasi_lof.csv",
        "ringkasan_per_bulan.csv",
    ]
    available_files = [f for f in required_files if (data_dir / f).is_file()]

    return {
        "status": "ok",
        "service": "lembar-pantau-ml",
        "version": APP_VERSION,
        "engine": "scikit-learn LOF (k=10, threshold=1.5)",
        "data_ready": len(available_files) == len(required_files),
        "files_found": len(available_files),
        "files_expected": len(required_files),
    }


@app.post("/analyze", dependencies=[Depends(verify_ml_key)])
def analyze_endpoint(payload: AnalyzeRequest) -> dict[str, Any]:
    data_dir = Path(os.getenv("DATA_DIR", str(BASE_DIR.parent / "data"))).resolve()

    if payload.records is not None:
        raw_df = pd.DataFrame(payload.records)
        if not raw_df.empty and payload.bulan is not None and all(isinstance(x, int) for x in payload.bulan):
            raw_df = raw_df[raw_df["bulan"].isin(payload.bulan)].copy()
    elif payload.bulan is not None and len(payload.bulan) == 0:
        raw_df = pd.DataFrame()
    elif payload.bulan and len(payload.bulan) > 0 and isinstance(payload.bulan[0], dict):
        raw_df = pd.DataFrame([x for x in payload.bulan if isinstance(x, dict)])
    else:
        wide_path = data_dir / "kjp_2026_wide.csv"
        if not wide_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Berkas sumber tidak ditemukan: {wide_path}",
            )
        raw_df = pd.read_csv(wide_path, dtype={"id_pangkalan": str})
        if payload.bulan is not None and all(isinstance(x, int) for x in payload.bulan):
            bulan_ints = [int(x) for x in payload.bulan]  # type: ignore[arg-type]
            raw_df = raw_df[raw_df["bulan"].isin(bulan_ints)].copy()

    if raw_df.empty:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Data bulan yang diminta kosong.",
        )

    # Jika fitur sudah ada pada raw_df (misal pengujian langsung), gunakan langsung; jika belum, hitung dari harian
    has_precomputed = all(c in raw_df.columns for c in ["total", "hari_aktif", "rasio_hari_aktif", "cv_harian", "porsi_nilai_dominan", "log_total"])
    if has_precomputed and "d01" not in raw_df.columns and "volume_harian" not in raw_df.columns:
        feat_df = raw_df.copy()
        if "porsi_hari_puncak" not in feat_df.columns:
            feat_df["porsi_hari_puncak"] = np.nan
    else:
        feat_df = compute_features(raw_df)  # type: ignore[assignment]

    scored_df = run_lof(
        feat_df,
        features=payload.fitur,
        k=payload.k,
        threshold=payload.threshold,
    )
    flagged_df = flag_rules(scored_df)
    klas_df = classify_consistency(flagged_df, threshold=payload.threshold)

    items: list[dict[str, Any]] = []
    for _, row in flagged_df.iterrows():
        fitur_dict = {
            "log_total": _clean_float(row.get("log_total")),
            "cv_harian": _clean_float(row.get("cv_harian")),
            "rasio_hari_aktif": _clean_float(row.get("rasio_hari_aktif")),
            "porsi_nilai_dominan": _clean_float(row.get("porsi_nilai_dominan")),
        }
        z_dict = {
            "z_log_total": _clean_float(row.get("z_log_total")),
            "z_cv_harian": _clean_float(row.get("z_cv_harian")),
            "z_rasio_hari_aktif": _clean_float(row.get("z_rasio_hari_aktif")),
            "z_porsi_nilai_dominan": _clean_float(row.get("z_porsi_nilai_dominan")),
        }
        lof_val = _clean_float(row.get("lof"))
        flag_val = bool(row.get("flag_lof", False))

        items.append(
            {
                "id_pangkalan": str(row.get("id_pangkalan", "")),
                "nama_pangkalan": str(row.get("nama_pangkalan", "")),
                "bulan": int(row["bulan"]),
                "alokasi": int(row.get("alokasi", 0)),
                "total": float(row.get("total", 0.0)),
                "total_fakultatif": int(row.get("total_fakultatif", 0)),
                "grand_total": int(row.get("grand_total", 0)),
                "sisa_alokasi": int(row.get("sisa_alokasi", 0)),
                "hari_aktif": int(row.get("hari_aktif", 0)),
                "n_hari_kerja": int(row.get("n_hari_kerja", 26)),
                "fitur": fitur_dict,
                "z": z_dict,
                **fitur_dict,
                **z_dict,
                "lof": lof_val,
                "flag": flag_val,
                "flag_lof": flag_val,
                "aturan": {
                    "melebihi_alokasi": bool(row.get("r_realisasi_gt_alokasi", False)),
                    "gt_2x_alokasi": bool(row.get("r_gt_2x_alokasi", False)),
                    "nol": bool(row.get("r_nol_sebulan", False)),
                    "lonjakan": bool(row.get("r_lonjakan_satu_hari", False)),
                    "seragam": bool(row.get("r_pola_seragam", False)),
                    "fakultatif": bool(row.get("r_fakultatif", False)),
                },
            }
        )

    klasifikasi_list = _serialize_klasifikasi(klas_df)
    per_kategori = klas_df["kategori"].value_counts().to_dict() if not klas_df.empty else {}

    return {
        "k": payload.k,
        "threshold": payload.threshold,
        "fitur_names": payload.fitur,
        "items": items,
        "klasifikasi": klasifikasi_list,
        "ringkasan": {
            "total_observasi": len(items),
            "masuk_model": int(flagged_df["lof"].notna().sum()),
            "ditandai": int(flagged_df["flag_lof"].sum()),
            "per_kategori": {k: int(v) for k, v in per_kategori.items()},
        },
    }


@app.post("/classify", dependencies=[Depends(verify_ml_key)])
def classify_endpoint(payload: ClassifyRequest) -> dict[str, Any]:
    df = pd.DataFrame(payload.riwayat)
    if "bulan" not in df.columns or "lof" not in df.columns:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Setiap item riwayat wajib memiliki field 'bulan' dan 'lof'.",
        )
    if "id_pangkalan" not in df.columns:
        if "kode" in df.columns:
            df["id_pangkalan"] = df["kode"].astype(str)
        elif "pangkalan_id" in df.columns:
            df["id_pangkalan"] = df["pangkalan_id"].astype(str)
        else:
            df["id_pangkalan"] = "P01"
    if "nama_pangkalan" not in df.columns:
        df["nama_pangkalan"] = df["id_pangkalan"]

    df["lof"] = pd.to_numeric(df["lof"], errors="coerce")
    klas_df = classify_consistency(df, threshold=payload.threshold)
    klas_list = _serialize_klasifikasi(klas_df)
    per_kategori = klas_df["kategori"].value_counts().to_dict() if not klas_df.empty else {}

    return {
        "threshold": payload.threshold,
        "klasifikasi": klas_list,
        "per_kategori": {k: int(v) for k, v in per_kategori.items()},
    }


@app.post("/lof/raw", dependencies=[Depends(verify_ml_key)])
def lof_raw_endpoint(payload: LofRawRequest) -> dict[str, Any]:
    scores = run_lof_raw(payload.titik, k=payload.k)
    rounded = [round(s, 3) for s in scores]
    flags = [bool(s >= payload.threshold) for s in scores]

    return {
        "k": payload.k,
        "threshold": payload.threshold,
        "lof": scores,
        "lof_rounded": rounded,
        "flag": flags,
    }


def _serialize_klasifikasi(klas_df: pd.DataFrame) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for _, row in klas_df.iterrows():
        out.append(
            {
                "id_pangkalan": str(row.get("id_pangkalan", "")),
                "nama_pangkalan": str(row.get("nama_pangkalan", "")),
                "kategori": str(row.get("kategori", "")),
                "kategori_lof": str(row.get("kategori_lof", "")),
                "bulan_valid": int(row.get("bulan_valid", 0)),
                "bulan_flag": int(row.get("bulan_flag_lof", 0)),
                "proporsi_flag": _clean_float(row.get("proporsi_flag")),
                "rerata_lof": _clean_float(row.get("rerata_lof")),
                "maks_lof": _clean_float(row.get("maks_lof")),
                "bulan_maks": row.get("bulan_maks") if pd.notna(row.get("bulan_maks")) else None,
                "bulan_yang_ditandai": str(row.get("bulan_yang_ditandai", "")) if pd.notna(row.get("bulan_yang_ditandai")) else "",
                "run_terpanjang": int(row.get("run_bulan_berurutan_terpanjang", 0)),
            }
        )
    return out
