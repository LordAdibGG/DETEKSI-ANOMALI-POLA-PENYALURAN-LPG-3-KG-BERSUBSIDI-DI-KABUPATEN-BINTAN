import json
import math
import os
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient
from sklearn.neighbors import LocalOutlierFactor

from app.core import (
    classify_consistency,
    compute_features,
    flag_rules,
    robust_z,
    run_lof,
    run_lof_raw,
)
from main import app

os.environ.setdefault("ML_API_KEY", "lembar-pantau-ml-secret-2026")
HEADERS = {"X-ML-KEY": os.environ["ML_API_KEY"]}
DATA_DIR = Path(__file__).resolve().parents[2] / "data"

client = TestClient(app)


def test_tabel_iv_1_enam_titik_k2():
    """
    Contoh 6 titik Tabel IV.1 dengan k=2 harus menghasilkan LOF:
    0,945; 0,945; 1,124; 1,365; 1,365; 7,186 (toleransi 0,001)
    dan identik dengan sklearn LocalOutlierFactor.
    """
    titik_enam = [
        [-3.696, -8.464],
        [-2.023, -9.850],
        [-2.070, -8.937],
        [1.736, -9.612],
        [0.883, -9.557],
        [0.729, 5.525],
    ]
    expected = [0.945, 0.945, 1.124, 1.365, 1.365, 7.186]

    # Bandingkan langsung dengan sklearn LocalOutlierFactor
    sklearn_model = LocalOutlierFactor(n_neighbors=2, metric="euclidean").fit(np.asarray(titik_enam, dtype=float))
    sklearn_scores = (-sklearn_model.negative_outlier_factor_).tolist()

    # Uji fungsi murni run_lof_raw
    scores_pure = run_lof_raw(titik_enam, k=2)
    for s_pure, s_sk, s_exp in zip(scores_pure, sklearn_scores, expected):
        assert abs(s_pure - s_sk) < 1e-9
        assert abs(s_pure - s_exp) <= 0.001

    assert [round(s, 3) for s in scores_pure] == expected

    # Uji endpoint POST /lof/raw
    response = client.post("/lof/raw", json={"titik": titik_enam, "k": 2}, headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["k"] == 2
    assert body["lof_rounded"] == expected
    assert body["flag"] == [False, False, False, False, False, True]


def test_robust_z_fallback_std_when_mad_zero():
    """
    Bila MAD = 0 (mayoritas nilai identik), robust_z harus fallback ke simpangan baku (ddof=0).
    """
    s = pd.Series([10.0, 10.0, 10.0, 10.0, 20.0])
    z = robust_z(s)
    std_val = float(s.std(ddof=0))
    assert std_val > 0
    assert np.isclose(z.iloc[-1], (20.0 - 10.0) / std_val)

    # Bila seluruh nilai konstan (MAD=0 dan std=0), z harus 0
    s_const = pd.Series([5.0, 5.0, 5.0])
    z_const = robust_z(s_const)
    assert (z_const == 0.0).all()


def test_pure_pipeline_reproduces_k10_baseline_and_jaccard_1():
    """
    Run k=10 dengan threshold=1.5 harus mereproduksi:
    - 293 pangkalan-bulan, 282 masuk model, 28 ditandai
    - Ditandai per bulan Jan-Okt: 2, 4, 3, 3, 2, 2, 2, 2, 5, 3
    - Kategori: Normal 18, Sporadis 6, Berulang 3, Konsisten tinggi 1, Data kurang 1, Tidak dinilai 1
    - Flag aturan: melebihi_alokasi 33, lebih_2x_alokasi 9, nol_bulanan 11, lonjakan_harian 2,
      seragam_sempurna 1, ada_fakultatif 69
    - Jaccard 1.0 terhadap baseline kjp_2026_lof_per_bulan.csv
    """
    wide_df = pd.read_csv(DATA_DIR / "kjp_2026_wide.csv", dtype={"id_pangkalan": str})

    feat_df = compute_features(wide_df)
    lof_df = run_lof(feat_df, k=10, threshold=1.5)
    rules_df = flag_rules(lof_df)
    klas_df = classify_consistency(rules_df, threshold=1.5)

    assert len(lof_df) == 293
    assert int(lof_df["lof"].notna().sum()) == 282
    assert int(lof_df["flag_lof"].sum()) == 28

    per_bulan = (
        lof_df.groupby("bulan")["flag_lof"]
        .sum()
        .reindex(range(1, 11), fill_value=0)
        .astype(int)
        .tolist()
    )
    assert per_bulan == [2, 4, 3, 3, 2, 2, 2, 2, 5, 3]

    kat_counts = klas_df["kategori"].value_counts().to_dict()
    assert kat_counts.get("Normal", 0) == 18
    assert kat_counts.get("Sporadis", 0) == 6
    assert kat_counts.get("Berulang", 0) == 3
    assert kat_counts.get("Konsisten tinggi", 0) == 1
    assert kat_counts.get("Data kurang", 0) == 1
    assert kat_counts.get("Tidak dinilai", 0) == 1

    # Cek flag aturan
    assert int(rules_df["r_realisasi_gt_alokasi"].sum()) == 33
    assert int(rules_df["r_gt_2x_alokasi"].sum()) == 9
    assert int(rules_df["r_nol_sebulan"].sum()) == 11
    assert int(rules_df["r_lonjakan_satu_hari"].sum()) == 2
    assert int(rules_df["r_pola_seragam"].sum()) == 1
    assert int(rules_df["r_fakultatif"].sum()) == 69

    # Cek paritas Jaccard 1.0 dengan CSV baseline
    baseline_df = pd.read_csv(DATA_DIR / "kjp_2026_lof_per_bulan.csv", dtype={"id_pangkalan": str})
    baseline_flags = set(
        zip(
            baseline_df.loc[baseline_df["flag_lof"] == True, "id_pangkalan"].astype(str),
            baseline_df.loc[baseline_df["flag_lof"] == True, "bulan"].astype(int),
        )
    )
    new_flags = set(
        zip(
            lof_df.loc[lof_df["flag_lof"] == True, "id_pangkalan"].astype(str),
            lof_df.loc[lof_df["flag_lof"] == True, "bulan"].astype(int),
        )
    )
    jaccard = len(baseline_flags & new_flags) / len(baseline_flags | new_flags)
    assert jaccard == 1.0


def test_fastapi_analyze_and_classify_endpoints():
    """
    Uji endpoint POST /analyze dan POST /classify pada aplikasi FastAPI.
    """
    response = client.post(
        "/analyze",
        json={"bulan": list(range(1, 11)), "k": 10, "threshold": 1.5},
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()

    assert body["ringkasan"]["total_observasi"] == 293
    assert body["ringkasan"]["masuk_model"] == 282
    assert body["ringkasan"]["ditandai"] == 28
    assert body["ringkasan"]["per_kategori"] == {
        "Normal": 18,
        "Sporadis": 6,
        "Berulang": 3,
        "Konsisten tinggi": 1,
        "Data kurang": 1,
        "Tidak dinilai": 1,
    }

    # Uji POST /classify menggunakan riwayat hasil LOF
    riwayat_payload = [
        {
            "id_pangkalan": item["id_pangkalan"],
            "nama_pangkalan": item["nama_pangkalan"],
            "bulan": item["bulan"],
            "lof": item["lof"],
        }
        for item in body["items"]
    ]
    res_classify = client.post(
        "/classify",
        json={"riwayat": riwayat_payload, "threshold": 1.5},
        headers=HEADERS,
    )
    assert res_classify.status_code == 200
    klas_body = res_classify.json()
    assert klas_body["per_kategori"] == {
        "Normal": 18,
        "Sporadis": 6,
        "Berulang": 3,
        "Konsisten tinggi": 1,
        "Data kurang": 1,
        "Tidak dinilai": 1,
    }


def test_edge_cases_no_nan_or_infinity_in_json():
    """
    Uji kasus tepi:
    1. Bulan tanpa data (bulan=[11], bulan=[], records=[])
    2. Pangkalan nol (total=0 sebulan dan seluruh bulan)
    3. Titik duplikat (LRD tak hingga tidak menghasilkan NaN atau Infinity di JSON)
    4. k lebih besar dari jumlah titik (k > N)
    5. MAD = 0 (sebagian konstan & seluruhnya konstan di /analyze)
    """
    # 1. Bulan tanpa data
    res_empty_month = client.post("/analyze", json={"bulan": [11], "k": 10}, headers=HEADERS)
    assert res_empty_month.status_code == 422

    res_empty_list = client.post("/analyze", json={"bulan": [], "k": 10}, headers=HEADERS)
    assert res_empty_list.status_code == 422

    res_empty_records = client.post("/analyze", json={"records": [], "k": 10}, headers=HEADERS)
    assert res_empty_records.status_code == 422

    empty_feat = compute_features([])
    empty_lof = run_lof(empty_feat, k=10, threshold=1.5)
    empty_rules = flag_rules(empty_lof)
    empty_klas = classify_consistency(empty_rules, threshold=1.5)
    assert empty_klas.empty

    # 2. Pangkalan nol (seluruh pangkalan pada rekaman bernilai 0)
    zero_records = [
        {
            "bulan": 1,
            "id_pangkalan": "P_NOL_1",
            "nama_pangkalan": "Pangkalan Nol 1",
            "alokasi": 1000,
            "total_fakultatif": 0,
            "grand_total": 0,
            "sisa_alokasi": 1000,
            "volume_harian_kerja": [0.0] * 26,
        },
        {
            "bulan": 1,
            "id_pangkalan": "P_NOL_2",
            "nama_pangkalan": "Pangkalan Nol 2",
            "alokasi": 1000,
            "total_fakultatif": 0,
            "grand_total": 0,
            "sisa_alokasi": 1000,
            "volume_harian_kerja": [0.0] * 26,
        },
    ]
    res_zero = client.post("/analyze", json={"records": zero_records, "k": 10}, headers=HEADERS)
    assert res_zero.status_code == 200
    raw_json_zero = res_zero.text
    assert "NaN" not in raw_json_zero and "Infinity" not in raw_json_zero
    body_zero = json.loads(raw_json_zero)
    assert body_zero["ringkasan"]["masuk_model"] == 0
    assert body_zero["ringkasan"]["ditandai"] == 0
    assert body_zero["ringkasan"]["per_kategori"] == {"Tidak dinilai": 2}
    for item in body_zero["items"]:
        assert item["lof"] is None
        assert item["aturan"]["nol"] is True

    # 3. Titik duplikat (semua identik & klaster identik + 1 pencilan)
    dup_all = [[1.5, -2.5]] * 6
    res_dup_all = client.post("/lof/raw", json={"titik": dup_all, "k": 3}, headers=HEADERS)
    assert res_dup_all.status_code == 200
    assert "NaN" not in res_dup_all.text and "Infinity" not in res_dup_all.text
    for val in res_dup_all.json()["lof"]:
        assert math.isfinite(val)

    dup_cluster = [[0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], [3.0, 4.0]]
    res_dup_cluster = client.post("/lof/raw", json={"titik": dup_cluster, "k": 2}, headers=HEADERS)
    assert res_dup_cluster.status_code == 200
    assert "NaN" not in res_dup_cluster.text and "Infinity" not in res_dup_cluster.text
    for val in res_dup_cluster.json()["lof"]:
        assert math.isfinite(val)

    # 4 & 5. Titik duplikat + MAD = 0 + k lebih besar dari jumlah titik (k=100 pada 5 pangkalan) di /analyze
    dup_records = []
    for idx in range(5):
        vol = 50.0 if idx < 4 else 120.0
        dup_records.append(
            {
                "bulan": 1,
                "id_pangkalan": f"P_DUP_{idx + 1}",
                "nama_pangkalan": f"Pangkalan Duplikat {idx + 1}",
                "alokasi": 1300,
                "total_fakultatif": 0,
                "grand_total": int(vol * 26),
                "sisa_alokasi": int(1300 - vol * 26),
                "volume_harian_kerja": [vol] * 26,
            }
        )
    res_dup_analyze = client.post(
        "/analyze",
        json={"records": dup_records, "k": 100, "threshold": 1.5},
        headers=HEADERS,
    )
    assert res_dup_analyze.status_code == 200
    assert "NaN" not in res_dup_analyze.text and "Infinity" not in res_dup_analyze.text
    body_dup = res_dup_analyze.json()
    assert body_dup["ringkasan"]["masuk_model"] == 5
    for item in body_dup["items"]:
        assert item["lof"] is not None and math.isfinite(item["lof"])

    # Uji k > N pada /lof/raw (k=50 pada 4 titik)
    res_k_large = client.post(
        "/lof/raw",
        json={"titik": [[0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [5.0, 5.0]], "k": 50},
        headers=HEADERS,
    )
    assert res_k_large.status_code == 200
    assert len(res_k_large.json()["lof"]) == 4
    assert all(math.isfinite(x) for x in res_k_large.json()["lof"])

