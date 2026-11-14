"""
Fungsi murni perhitungan fitur, z-score robust, Local Outlier Factor (LOF),
flag aturan, dan klasifikasi konsistensi antarbulan (tanpa matplotlib & tanpa I/O).
Direfaktor langsung dari /data/lof_kjp_2026.py.
"""
from __future__ import annotations

import datetime as dt
from typing import Any, Sequence

import numpy as np
import pandas as pd
from sklearn.neighbors import LocalOutlierFactor

DEFAULT_FEATURES: list[str] = [
    "log_total",
    "cv_harian",
    "rasio_hari_aktif",
    "porsi_nilai_dominan",
]

BULAN_LABELS: list[str] = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
]

HARI_PER_BULAN: dict[int, int] = {
    1: 31,
    2: 28,
    3: 31,
    4: 30,
    5: 31,
    6: 30,
    7: 31,
    8: 31,
    9: 30,
    10: 31,
    11: 30,
    12: 31,
}


def working_days(bulan: int, tahun: int = 2026) -> list[int]:
    """Kembalikan daftar tanggal hari kerja (non-Minggu) pada bulan terkait."""
    n_hari = HARI_PER_BULAN.get(int(bulan), 30)
    return [d for d in range(1, n_hari + 1) if dt.date(tahun, int(bulan), d).weekday() != 6]


def compute_feature_vector(values: Sequence[float] | np.ndarray) -> dict[str, float]:
    """Hitung vektor fitur dari deret volume penyaluran harian (hari kerja non-Minggu)."""
    v = np.asarray(values, dtype=float)
    nz = v[v > 0]
    total = float(v.sum())
    hari_aktif = int(len(nz))
    rasio_hari_aktif = float(len(nz) / len(v)) if len(v) > 0 else 0.0

    if len(nz) > 0:
        _, counts = np.unique(nz, return_counts=True)
        cv_harian = float(nz.std(ddof=0) / nz.mean()) if len(nz) > 1 else 0.0
        porsi_nilai_dominan = float(counts.max() / len(nz))
        porsi_hari_puncak = float(v.max() / total) if total > 0 else np.nan
    else:
        cv_harian = np.nan
        porsi_nilai_dominan = np.nan
        porsi_hari_puncak = np.nan

    log_total = float(np.log1p(total))

    return {
        "total": total,
        "hari_aktif": hari_aktif,
        "rasio_hari_aktif": rasio_hari_aktif,
        "cv_harian": cv_harian,
        "porsi_nilai_dominan": porsi_nilai_dominan,
        "porsi_hari_puncak": porsi_hari_puncak,
        "log_total": log_total,
    }


def compute_features(
    data: pd.DataFrame | Sequence[dict[str, Any]] | Sequence[float] | np.ndarray,
    tahun: int = 2026,
) -> pd.DataFrame | dict[str, float]:
    """
    Hitung fitur bulanan dari DataFrame/list baris laporan bulanan (atau 1D array volume harian).
    Setiap baris DataFrame dapat memiliki kolom d01..d31 atau kolom 'volume_harian' (list angka hari kerja).
    """
    if isinstance(data, np.ndarray) and data.ndim == 1:
        return compute_feature_vector(data)
    if isinstance(data, (list, tuple)) and len(data) > 0 and isinstance(data[0], (int, float, np.number)):
        return compute_feature_vector(data)  # type: ignore[arg-type]

    df = data.copy() if isinstance(data, pd.DataFrame) else pd.DataFrame(list(data))
    if df.empty:
        return pd.DataFrame(
            columns=[
                "bulan",
                "id_pangkalan",
                "nama_pangkalan",
                "alokasi",
                "total",
                "grand_total",
                "total_fakultatif",
                "sisa_alokasi",
                "hari_aktif",
                "n_hari_kerja",
                "rasio_hari_aktif",
                "cv_harian",
                "porsi_nilai_dominan",
                "porsi_hari_puncak",
                "log_total",
            ]
        )
    rows: list[dict[str, Any]] = []

    for _, row in df.iterrows():
        m = int(row["bulan"])
        kerja = working_days(m, tahun=tahun)

        if "volume_harian_kerja" in row and isinstance(row["volume_harian_kerja"], (list, tuple, np.ndarray)):
            vals = [float(x) for x in row["volume_harian_kerja"]]
        elif "volume_harian" in row and isinstance(row["volume_harian"], (list, tuple, np.ndarray)):
            vh = row["volume_harian"]
            if len(vh) > 0 and isinstance(vh[0], dict):
                vals = [
                    float(item.get("volume", 0))
                    for item in vh
                    if not item.get("is_minggu", False) and int(item.get("hari", 0)) in kerja
                ]
            else:
                vals = [float(vh[d - 1]) for d in kerja if (d - 1) < len(vh)]
        else:
            vals = [
                float(row[f"d{d:02d}"]) if pd.notna(row.get(f"d{d:02d}")) else 0.0
                for d in kerja
            ]

        feat = compute_feature_vector(vals)
        alokasi = int(row.get("alokasi", 0))
        total_fakultatif = int(row.get("total_fakultatif", row.get("fakultatif", 0)))
        grand_total = int(row.get("grand_total", int(round(feat["total"])) + total_fakultatif))
        sisa_alokasi = int(row.get("sisa_alokasi", alokasi - grand_total))

        feat.update(
            {
                "bulan": m,
                "id_pangkalan": str(row.get("id_pangkalan", row.get("kode", ""))),
                "nama_pangkalan": str(row.get("nama_pangkalan", row.get("nama", ""))),
                "alokasi": alokasi,
                "grand_total": grand_total,
                "total_fakultatif": total_fakultatif,
                "sisa_alokasi": sisa_alokasi,
                "n_hari_kerja": len(vals),
            }
        )
        if "kode" in row:
            feat["kode"] = str(row["kode"])
        if "laporan_id" in row:
            feat["laporan_id"] = row["laporan_id"]
        if "pangkalan_id" in row:
            feat["pangkalan_id"] = row["pangkalan_id"]

        rows.append(feat)

    return pd.DataFrame(rows)


def robust_z(x: pd.Series | Sequence[float] | np.ndarray) -> pd.Series:
    """
    Hitung z-score robust: (x - median) / (1,4826 * MAD).
    Jika MAD == 0, gunakan simpangan baku populasi (std ddof=0) sebagai fallback.
    """
    s = x.astype(float) if isinstance(x, pd.Series) else pd.Series(np.asarray(x, dtype=float))
    med = s.median()
    mad = (s - med).abs().median() * 1.4826
    if mad == 0:
        mad = s.std(ddof=0)
    if mad and not np.isnan(mad):
        return (s - med) / mad
    return s * 0.0


def run_lof(
    df: pd.DataFrame,
    features: Sequence[str] = DEFAULT_FEATURES,
    k: int = 10,
    threshold: float = 1.5,
) -> pd.DataFrame:
    """
    Jalankan normalisasi robust_z per bulan dan perhitungan LocalOutlierFactor (metric='euclidean')
    pada pangkalan-bulan aktif (total > 0).
    """
    out = df.copy()
    out["lof"] = np.nan
    for c in features:
        out["z_" + c] = np.nan

    active = out[out["total"] > 0]
    for _, g in active.groupby("bulan"):
        z_df = pd.DataFrame({c: robust_z(g[c]) for c in features}, index=g.index)
        kk = min(int(k), len(g) - 1)
        if kk >= 1:
            lof_model = LocalOutlierFactor(n_neighbors=kk, metric="euclidean").fit(z_df.values)
            scores = np.nan_to_num(-lof_model.negative_outlier_factor_, nan=1.0, posinf=1.0, neginf=1.0)
            out.loc[g.index, "lof"] = scores
        elif len(g) == 1:
            out.loc[g.index, "lof"] = 1.0
        for c in features:
            out.loc[g.index, "z_" + c] = z_df[c]

    out["flag_lof"] = out["lof"] >= float(threshold)
    return out


def run_lof_raw(points: Sequence[Sequence[float]] | np.ndarray, k: int = 2) -> list[float]:
    """
    Hitung skor LOF langsung pada koordinat titik mentah (tanpa normalisasi z-score)
    menggunakan metrik Euclidean. Digunakan untuk uji Tabel IV.1 dan LOF Playground.
    """
    arr = np.asarray(points, dtype=float)
    if arr.ndim == 1:
        arr = arr.reshape(-1, 1)
    if len(arr) < 2:
        return [1.0 for _ in range(len(arr))]
    kk = max(1, min(int(k), len(arr) - 1))
    model = LocalOutlierFactor(n_neighbors=kk, metric="euclidean").fit(arr)
    scores = np.nan_to_num(-model.negative_outlier_factor_, nan=1.0, posinf=1.0, neginf=1.0)
    return scores.astype(float).tolist()


def flag_rules(df: pd.DataFrame) -> pd.DataFrame:
    """Terapkan 6 aturan deterministik pendamping LOF pada DataFrame bulanan."""
    out = df.copy()
    out["r_realisasi_gt_alokasi"] = (out["grand_total"] > out["alokasi"]) & (out["bulan"] != 2)
    out["r_gt_2x_alokasi"] = (out["grand_total"] > 2 * out["alokasi"]) & (out["bulan"] != 2)
    out["r_nol_sebulan"] = out["total"] == 0
    out["r_lonjakan_satu_hari"] = (out["porsi_hari_puncak"] > 0.4) & (out["hari_aktif"] <= 3)
    out["r_pola_seragam"] = (out["porsi_nilai_dominan"] >= 0.9) & (out["hari_aktif"] >= 8)
    out["r_fakultatif"] = out["total_fakultatif"] > 0
    return out


def normalize_kategori_short(kategori_lof: str) -> str:
    lower = kategori_lof.lower()
    if lower.startswith("normal"):
        return "Normal"
    if lower.startswith("sporadis"):
        return "Sporadis"
    if lower.startswith("berulang"):
        return "Berulang"
    if lower.startswith("konsisten tinggi"):
        return "Konsisten tinggi"
    if lower.startswith("data kurang"):
        return "Data kurang"
    if lower.startswith("tidak dinilai"):
        return "Tidak dinilai"
    return kategori_lof


def classify_consistency(df: pd.DataFrame, threshold: float = 1.5) -> pd.DataFrame:
    """
    Klasifikasikan setiap pangkalan berdasarkan konsistensi tanda anomali LOF antarbulan.
    Aturan:
    - bulan_valid == 0 -> Tidak dinilai (nol sepanjang waktu)
    - bulan_valid < 4  -> Data kurang (<4 bulan valid)
    - bulan_flag == 0  -> Normal
    - proporsi <= 0.30 -> Sporadis (anomali)
    - proporsi < 0.70  -> Berulang (sedang)
    - proporsi >= 0.70 -> Konsisten tinggi (profil khusus)
    """
    work = df.copy()
    if "lof" in work.columns:
        work["flag_lof"] = work["lof"].notna() & (work["lof"] >= float(threshold))
    elif "flag_lof" not in work.columns:
        work["flag_lof"] = work.get("flag", False).astype(bool)

    def _klas_group(g: pd.DataFrame) -> pd.Series:
        v = g["lof"].notna()
        n = int(v.sum())
        nflag = int(g["flag_lof"].sum())
        f = nflag / n if n > 0 else np.nan

        max_bulan = max(10, int(g["bulan"].max())) if len(g) > 0 and g["bulan"].notna().any() else 10
        flags = (
            g.sort_values("bulan")
            .set_index("bulan")["flag_lof"]
            .reindex(range(1, max_bulan + 1))
            .fillna(False)
            .astype(bool)
            .tolist()
        )
        run = mx = 0
        for fl in flags:
            run = run + 1 if fl else 0
            mx = max(mx, run)

        if n == 0:
            label = "Tidak dinilai (nol sepanjang waktu)"
        elif n < 4:
            label = "Data kurang (<4 bulan valid)"
        elif nflag == 0:
            label = "Normal"
        elif f <= 0.3:
            label = "Sporadis (anomali)"
        elif f < 0.7:
            label = "Berulang (sedang)"
        else:
            label = "Konsisten tinggi (profil khusus)"

        flagged_months = [
            BULAN_LABELS[int(b) - 1]
            for b in sorted(g[g["flag_lof"]]["bulan"].astype(int).tolist())
            if 1 <= int(b) <= len(BULAN_LABELS)
        ]

        bulan_maks = None
        if n > 0:
            idx_max = g["lof"].idxmax()
            b_max = int(g.loc[idx_max, "bulan"])
            bulan_maks = BULAN_LABELS[b_max - 1] if 1 <= b_max <= len(BULAN_LABELS) else str(b_max)

        result: dict[str, Any] = {
            "nama_pangkalan": g["nama_pangkalan"].iloc[0] if "nama_pangkalan" in g.columns else "",
            "bulan_valid": n,
            "bulan_flag_lof": nflag,
            "proporsi_flag": round(float(f), 2) if n > 0 else np.nan,
            "rerata_lof": round(float(g["lof"].mean()), 2) if n > 0 else np.nan,
            "maks_lof": round(float(g["lof"].max()), 2) if n > 0 else np.nan,
            "bulan_maks": bulan_maks,
            "bulan_yang_ditandai": ", ".join(flagged_months),
            "run_bulan_berurutan_terpanjang": mx,
            "kategori_lof": label,
            "kategori": normalize_kategori_short(label),
        }

        if "pangkalan_id" in g.columns:
            result["pangkalan_id"] = g["pangkalan_id"].iloc[0]
        if "kode" in g.columns:
            result["kode"] = g["kode"].iloc[0]

        if "r_realisasi_gt_alokasi" in g.columns:
            result["bulan_realisasi_gt_alokasi(tanpa Feb)"] = int(g["r_realisasi_gt_alokasi"].sum())
            result["bulan_gt_2x_alokasi(tanpa Feb)"] = int(g["r_gt_2x_alokasi"].sum())
            result["bulan_pola_seragam"] = int(g["r_pola_seragam"].sum())
            result["bulan_lonjakan_satu_hari"] = int(g["r_lonjakan_satu_hari"].sum())
            result["bulan_nol"] = int(g["r_nol_sebulan"].sum())
            result["bulan_fakultatif"] = int(g["r_fakultatif"].sum())

        return pd.Series(result)

    group_col = "id_pangkalan" if "id_pangkalan" in work.columns else "pangkalan_id"
    classified_rows = []
    for key, grp in work.groupby(group_col, sort=False):
        s = _klas_group(grp)
        s[group_col] = key
        classified_rows.append(s)

    c_df = pd.DataFrame(classified_rows)
    if c_df.empty:
        return c_df

    urut = {
        "Sporadis (anomali)": 0,
        "Berulang (sedang)": 1,
        "Konsisten tinggi (profil khusus)": 2,
        "Normal": 3,
        "Tidak dinilai (nol sepanjang waktu)": 4,
        "Data kurang (<4 bulan valid)": 5,
    }
    c_df = c_df.sort_values(
        by=["kategori_lof", "maks_lof"],
        key=lambda s: s.map(urut) if s.name == "kategori_lof" else -pd.to_numeric(s, errors="coerce").fillna(-1.0),
    ).reset_index(drop=True)

    return c_df
