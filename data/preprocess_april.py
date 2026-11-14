"""
Bab III Preprocessing + Rekayasa Fitur - April 2024 (KPG, KJP, BGJS)
Masukan : master_pangkalan_wide.csv, usulan_pemetaan_kecamatan.csv
Keluaran: data_april_bersih.csv, fitur_april_194.csv, log_preprocessing.csv
"""
import re
import sys
import numpy as np
import pandas as pd

DIR = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/outputs"
D = [f"d{i:02d}" for i in range(1, 31)]
SUN = [7, 14, 21, 28]
KERJA = [d for d in D if int(d[1:]) not in SUN]          # 26 hari non-Minggu
log = []


def L(langkah, detail):
    log.append({"langkah": langkah, "detail": detail})


w = pd.read_csv(f"{DIR}/master_pangkalan_wide.csv", dtype={"id_pangkalan": str})
w = w[w.agen != "MCAM"].copy().reset_index(drop=True)
L("Seleksi data", f"MCAM dikeluarkan (periode belum terverifikasi); tersisa {len(w)} pangkalan: "
  f"{w.agen.value_counts().to_dict()}")

# ---- 1. Kecamatan dari daftar subpenyalur (hanya pangkalan yang kosong)
pm = pd.read_csv(f"{DIR}/usulan_pemetaan_kecamatan.csv", dtype={"id_pangkalan": str})
pm = pm[["id_pangkalan", "kecamatan_sub", "kelurahan_sub"]].drop_duplicates("id_pangkalan")
w = w.merge(pm, on="id_pangkalan", how="left")
kosong = w.kecamatan.isna()
KEC = {"TELOK SEBONG": "Teluk Sebong", "TELUK SEBONG": "Teluk Sebong"}
w["kec_final"] = w.kecamatan
isi = kosong & w.kecamatan_sub.notna()
w.loc[isi, "kec_final"] = w.loc[isi, "kecamatan_sub"].str.upper().map(lambda s: KEC.get(s, s.title()))
w["sumber_kecamatan"] = np.where(~kosong, "berkas sumber", np.where(isi, "daftar subpenyalur Sep 2025 (perlu verifikasi)", "tidak tersedia"))
L("Kecamatan", f"{int(kosong.sum())} pangkalan tanpa kecamatan; {int(isi.sum())} dilengkapi dari daftar subpenyalur "
  f"(pencocokan nama + agen), {int((kosong & ~isi).sum())} tetap kosong")

# ---- 2. Penandaan pangkalan non-reguler dari nama
pat = re.compile(r"SPBU|KOPERASI|PERTASHOP|^PT[ .]|^CV[ .]|APMS")
w["non_reguler"] = w.nama_pangkalan.str.upper().str.contains(pat)
L("Penandaan non-reguler", f"{int(w.non_reguler.sum())} pangkalan ditandai dari nama (SPBU/koperasi/pertashop/badan usaha): "
  f"{w[w.non_reguler].nama_pangkalan.tolist()}")

# ---- 3. Hari kerja (non-Minggu) dan validasi hari libur
mgg = w[[f"d{d:02d}" for d in SUN]].sum().sum()
L("Hari Minggu", f"Penyaluran pada hari Minggu (7,14,21,28) total {int(mgg)} tabung; 26 hari kerja dipakai untuk fitur")

# ---- 4. Fitur enam dimensi
def fitur(r):
    v = r[KERJA].astype(float).values
    nz = v[v > 0]
    tot = v.sum()
    o = {"total": tot, "hari_aktif": len(nz), "rasio_hari_aktif": len(nz) / len(v)}
    if len(nz):
        vals, cnt = np.unique(nz, return_counts=True)
        o["cv_harian"] = nz.std(ddof=0) / nz.mean() if len(nz) > 1 else 0.0
        o["porsi_nilai_dominan"] = cnt.max() / len(nz)
        o["porsi_hari_puncak"] = v.max() / tot
    else:
        o["cv_harian"] = o["porsi_nilai_dominan"] = o["porsi_hari_puncak"] = np.nan
    return pd.Series(o)

f = pd.concat([w.drop(columns=D), w[D]], axis=1)
f = pd.concat([f, w.apply(fitur, axis=1)], axis=1)
f["rasio_realisasi_alokasi"] = f.total / f.alokasi
f["nol_sebulan"] = f.total == 0
f["masuk_model"] = ~f.nol_sebulan
L("Pangkalan nol sebulan", f"{int(f.nol_sebulan.sum())} pangkalan tidak menyalurkan apa pun; ditandai aturan dan tidak masuk model "
  f"(fitur variasi tak terdefinisi): {f[f.nol_sebulan].nama_pangkalan.tolist()}")

# ---- 5. Transformasi: log volume, lalu z-score robust per agen (median & MAD)
f["log_total"] = np.log1p(f.total)
FIT = ["log_total", "cv_harian", "rasio_hari_aktif", "porsi_nilai_dominan", "rasio_realisasi_alokasi"]
CEK = FIT + ["porsi_hari_puncak"]
zcols = []
for c in FIT:
    f["z_" + c] = np.nan
    zcols.append("z_" + c)
for a, idx in f[f.masuk_model].groupby("agen").groups.items():
    for c in FIT:
        x = f.loc[idx, c]
        med = x.median()
        mad = (x - med).abs().median() * 1.4826
        if mad == 0:                                    # cadangan bila MAD nol: pakai simpangan rerata
            mad = (x - med).abs().mean() * 1.2533
            L("Normalisasi", f"{a}/{c}: MAD=0, dipakai mean absolute deviation sebagai skala")
        f.loc[idx, "z_" + c] = ((x - med) / mad) if mad else 0.0
L("Normalisasi", "z-score robust per agen: (x - median agen) / (1,4826 x MAD agen); log1p pada total")

# ---- 6. Korelasi antar fitur (untuk seleksi)
cm = f.loc[f.masuk_model, CEK].corr(method="spearman")
tinggi = [(a, b, round(float(cm.loc[a, b]), 2)) for i, a in enumerate(CEK) for b in CEK[i + 1:] if abs(cm.loc[a, b]) >= 0.7]
L("Seleksi fitur", f"Pasangan fitur |rho Spearman| >= 0,7: {tinggi if tinggi else 'tidak ada'}")
L("Keputusan fitur", "porsi_hari_puncak dikeluarkan dari model karena redundan dengan rasio_hari_aktif (rho -0,85); "
  "dimensi lonjakan ditangani lewat aturan (satu hari >40% total dan hari aktif <=3). "
  "Alternatif rasio_puncak_rerata juga ditolak karena rho 0,88 dengan cv_harian. 5 fitur masuk model.")
f["flag_lonjakan_satu_hari"] = (f.porsi_hari_puncak > 0.4) & (f.hari_aktif <= 3)
f["flag_realisasi_gt_alokasi"] = f.rasio_realisasi_alokasi > 1
f["flag_realisasi_gt_2x_alokasi"] = f.rasio_realisasi_alokasi > 2
f["flag_pola_seragam"] = (f.porsi_nilai_dominan >= 0.9) & (f.hari_aktif >= 8)
L("Flag aturan", f"lonjakan satu hari={int(f.flag_lonjakan_satu_hari.sum())}, realisasi>alokasi={int(f.flag_realisasi_gt_alokasi.sum())}, "
  f">2x alokasi={int(f.flag_realisasi_gt_2x_alokasi.sum())}, pola seragam={int(f.flag_pola_seragam.sum())}, nol sebulan={int(f.nol_sebulan.sum())}")
cm.round(2).to_csv(f"{DIR}/korelasi_fitur_april.csv")

keep = ["id_baris", "agen", "id_pangkalan", "nama_pangkalan", "kec_final", "sumber_kecamatan", "kelurahan",
        "alokasi", "non_reguler", "nol_sebulan", "masuk_model", "total", "hari_aktif", "porsi_hari_puncak",
        "flag_lonjakan_satu_hari", "flag_realisasi_gt_alokasi", "flag_realisasi_gt_2x_alokasi", "flag_pola_seragam"] + FIT + zcols
f[keep].to_csv(f"{DIR}/fitur_april_194.csv", index=False)
f.drop(columns=["kecamatan", "kecamatan_sub", "kelurahan_sub"]).to_csv(f"{DIR}/data_april_bersih.csv", index=False)
pd.DataFrame(log).to_csv(f"{DIR}/log_preprocessing.csv", index=False)

pd.set_option("display.width", 220)
for r in log:
    print("-", r["langkah"], ":", r["detail"])
print("\nMasuk model:", int(f.masuk_model.sum()), "| per agen:", f[f.masuk_model].agen.value_counts().to_dict())
print("Kecamatan terisi:", f.kec_final.notna().sum(), "dari", len(f), "|", f.kec_final.value_counts().to_dict())
print("\nKorelasi:\n", cm.round(2).to_string())
print("\nNaN pada fitur z (harus 0):", int(f.loc[f.masuk_model, zcols].isna().sum().sum()))
print("\nDeskripsi fitur z:\n", f.loc[f.masuk_model, zcols].describe().round(2).T[["mean", "std", "min", "max"]].to_string())
