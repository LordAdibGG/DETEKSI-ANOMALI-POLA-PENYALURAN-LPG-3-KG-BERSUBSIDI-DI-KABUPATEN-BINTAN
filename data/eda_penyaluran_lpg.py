"""
EDA Penyaluran LPG 3 Kg - Kab. Bintan (Bab II.3)
Masukan : master_pangkalan_wide.csv, master_harian_long.csv
Keluaran: folder eda/ berisi gambar PNG dan tabel statistik CSV
"""
import os
import sys
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

DIR = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/outputs"
OUT = f"{DIR}/eda"
os.makedirs(OUT, exist_ok=True)
D = [f"d{i:02d}" for i in range(1, 31)]
SUN = {"KPG": [7, 14, 21, 28], "KJP": [7, 14, 21, 28], "BGJS": [7, 14, 21, 28], "MCAM": [3, 10, 17, 24]}
COL = {"KPG": "#4C72B0", "KJP": "#DD8452", "BGJS": "#55A868", "MCAM": "#8172B3"}

plt.rcParams.update({"figure.dpi": 150, "font.size": 10, "axes.titlesize": 12, "axes.titleweight": "bold",
                     "axes.spines.top": False, "axes.spines.right": False, "font.family": "DejaVu Sans"})

w = pd.read_csv(f"{DIR}/master_pangkalan_wide.csv", dtype={"id_pangkalan": str})

# ------------------------------------------------------------ fitur eksplorasi per pangkalan
def fitur(r):
    hari_kerja = [d for d in D if int(d[1:]) not in SUN[r["agen"]]]
    v = r[hari_kerja].astype(float).values
    nz = v[v > 0]
    tot = v.sum()
    out = {"hari_aktif": len(nz), "rasio_hari_aktif": len(nz) / len(v)}
    out["rerata_hari_aktif"] = nz.mean() if len(nz) else 0
    out["cv_harian"] = nz.std(ddof=0) / nz.mean() if len(nz) > 1 else np.nan
    out["maks_harian"] = v.max()
    out["porsi_hari_puncak"] = v.max() / tot if tot else np.nan
    out["rasio_puncak_rerata"] = v.max() / nz.mean() if len(nz) else np.nan
    if len(nz):
        vals, cnt = np.unique(nz, return_counts=True)
        out["porsi_nilai_dominan"] = cnt.max() / len(nz)   # seberapa seragam (pola template)
        out["nilai_dominan"] = vals[cnt.argmax()]
        out["nilai_unik"] = len(vals)
    else:
        out["porsi_nilai_dominan"], out["nilai_dominan"], out["nilai_unik"] = np.nan, np.nan, 0
    return pd.Series(out)

f = pd.concat([w, w.apply(fitur, axis=1)], axis=1)
f["utilisasi"] = f["total_hitung"] / f["alokasi"]
f["kelompok_periode"] = np.where(f["agen"] == "MCAM", "MCAM (periode ?)", "April 2024")
f.to_csv(f"{OUT}/fitur_eksplorasi_pangkalan.csv", index=False)

# ------------------------------------------------------------ tabel statistik
def desc(s):
    return pd.Series({"n": s.count(), "rerata": s.mean(), "median": s.median(), "std": s.std(),
                      "min": s.min(), "p25": s.quantile(.25), "p75": s.quantile(.75),
                      "p95": s.quantile(.95), "maks": s.max(),
                      "skewness": s.skew()})

rows = []
for a, g in list(f.groupby("agen")) + [("SEMUA", f)]:
    for c in ["total_hitung", "hari_aktif", "cv_harian", "porsi_nilai_dominan", "utilisasi"]:
        s = g[c].dropna()
        if len(s):
            rows.append(desc(s).rename((a, c)))
stat = pd.DataFrame(rows)
stat.index.names = ["agen", "variabel"]
stat.round(3).to_csv(f"{OUT}/statistik_ringkas.csv")

ringkas = f.groupby("agen").agg(
    pangkalan=("id_pangkalan", "count"), total_tabung=("total_hitung", "sum"),
    median_per_pangkalan=("total_hitung", "median"), alokasi=("alokasi", "sum"),
    nol_sebulan=("total_hitung", lambda s: int((s == 0).sum())),
    median_hari_aktif=("hari_aktif", "median"))
ringkas["utilisasi_agen"] = ringkas["total_tabung"] / ringkas["alokasi"].replace(0, np.nan)
ringkas.round(3).to_csv(f"{OUT}/ringkasan_per_agen.csv")

kec = f.groupby("kecamatan").agg(pangkalan=("id_pangkalan", "count"), total=("total_hitung", "sum"),
                                 median=("total_hitung", "median")).sort_values("total", ascending=False)
kec["porsi_total_%"] = (kec["total"] / kec["total"].sum() * 100).round(1)
kec.to_csv(f"{OUT}/ringkasan_per_kecamatan.csv")

# ------------------------------------------------------------ gambar
# 1. sebaran total per pangkalan
fig, ax = plt.subplots(1, 2, figsize=(11, 4))
bins = np.arange(0, 2800, 100)
for a in COL:
    ax[0].hist(f[f.agen == a].total_hitung, bins=bins, alpha=.6, label=f"{a} (n={int((f.agen==a).sum())})", color=COL[a])
ax[0].set_xlabel("Total tabung per pangkalan (sebulan)"); ax[0].set_ylabel("Jumlah pangkalan")
ax[0].set_title("Sebaran total penyaluran"); ax[0].legend()
data = [f[f.agen == a].total_hitung for a in COL]
bp = ax[1].boxplot(data, labels=list(COL), patch_artist=True, showfliers=True)
for p, a in zip(bp["boxes"], COL):
    p.set_facecolor(COL[a]); p.set_alpha(.6)
ax[1].set_ylabel("Total tabung per pangkalan"); ax[1].set_title("Boxplot per agen")
fig.tight_layout(); fig.savefig(f"{OUT}/g1_sebaran_total.png"); plt.close(fig)

# 2. realisasi vs alokasi
g = f[f.alokasi.notna()]
fig, ax = plt.subplots(1, 2, figsize=(11, 4.4))
for a in ["KPG", "KJP", "BGJS"]:
    s = g[g.agen == a]
    ax[0].scatter(s.alokasi, s.total_hitung, s=22, alpha=.7, color=COL[a], label=a)
mx = max(g.alokasi.max(), g.total_hitung.max())
ax[0].plot([0, mx], [0, mx], "k--", lw=1, label="realisasi = alokasi")
ax[0].set_xlabel("Alokasi bulanan"); ax[0].set_ylabel("Realisasi bulanan")
ax[0].set_title("Realisasi vs alokasi"); ax[0].legend()
for a in ["KPG", "KJP", "BGJS"]:
    ax[1].hist(g[g.agen == a].utilisasi.clip(upper=4), bins=np.arange(0, 4.2, .2), alpha=.6, color=COL[a], label=a)
ax[1].axvline(1, color="k", ls="--", lw=1)
ax[1].set_xlabel("Utilisasi = realisasi / alokasi (dipotong di 4x)"); ax[1].set_ylabel("Jumlah pangkalan")
ax[1].set_title("Utilisasi kuota"); ax[1].legend()
fig.tight_layout(); fig.savefig(f"{OUT}/g2_realisasi_vs_alokasi.png"); plt.close(fig)

# 3. total harian per agen
fig, ax = plt.subplots(2, 1, figsize=(11, 6), sharex=True)
for a in ["KPG", "KJP", "BGJS"]:
    ax[0].plot(range(1, 31), f[f.agen == a][D].sum().values, marker="o", ms=3, color=COL[a], label=a)
ax[0].set_title("Total penyaluran harian per agen (April 2024)"); ax[0].set_ylabel("Tabung"); ax[0].legend()
ax[1].plot(range(1, 31), f[f.agen == "MCAM"][D].sum().values, marker="o", ms=3, color=COL["MCAM"])
ax[1].set_title("MCAM (periode belum terkonfirmasi)"); ax[1].set_ylabel("Tabung"); ax[1].set_xlabel("Tanggal ke-")
for a, axx in [("KPG", ax[0]), ("MCAM", ax[1])]:
    for d in SUN[a]:
        axx.axvline(d, color="grey", ls=":", lw=.8)
fig.tight_layout(); fig.savefig(f"{OUT}/g3_total_harian.png"); plt.close(fig)

# 4. heatmap harian
for grp, ags, fn in [("April 2024 (KPG, KJP, BGJS)", ["KPG", "KJP", "BGJS"], "g4a_heatmap_april2024.png"),
                     ("MCAM (periode belum terkonfirmasi)", ["MCAM"], "g4b_heatmap_mcam.png")]:
    s = f[f.agen.isin(ags)].sort_values(["agen", "total_hitung"], ascending=[True, False])
    m = s[D].values.astype(float)
    fig, ax = plt.subplots(figsize=(10, max(5, len(s) * .045 + 1.5)))
    im = ax.imshow(np.log1p(m), aspect="auto", cmap="YlOrRd", interpolation="nearest")
    ax.set_xticks(range(0, 30, 2)); ax.set_xticklabels(range(1, 31, 2))
    ax.set_yticks([]); ax.set_xlabel("Tanggal ke-"); ax.set_ylabel(f"{len(s)} pangkalan (diurut per agen, total menurun)")
    b = 0
    for a in ags:
        n = int((s.agen == a).sum()); b += n
        if a != ags[-1]:
            ax.axhline(b - .5, color="k", lw=1)
        ax.text(30.3, b - n / 2, a, va="center", fontsize=9)
    ax.set_title(f"Heatmap penyaluran harian per pangkalan - {grp}")
    cb = fig.colorbar(im, ax=ax, pad=.08, fraction=.03); cb.set_label("log(1 + tabung)")
    fig.tight_layout(); fig.savefig(f"{OUT}/{fn}"); plt.close(fig)

# 5. kecamatan
k = kec.drop(index=[i for i in kec.index if pd.isna(i)], errors="ignore").sort_values("total")
fig, ax = plt.subplots(1, 2, figsize=(11, 4.2))
ax[0].barh(k.index, k.pangkalan, color="#4C72B0"); ax[0].set_title("Jumlah pangkalan per kecamatan\n(hanya yang kecamatannya diketahui)")
ax[1].barh(k.index, k.total, color="#55A868"); ax[1].set_title("Total tabung per kecamatan")
ax[1].set_yticklabels([])
fig.tight_layout(); fig.savefig(f"{OUT}/g5_per_kecamatan.png"); plt.close(fig)

# 6. pola seragam & variasi
fig, ax = plt.subplots(1, 2, figsize=(11, 4.2))
for a in COL:
    s = f[(f.agen == a) & (f.hari_aktif >= 5)]
    ax[0].scatter(s.hari_aktif, s.porsi_nilai_dominan, s=20, alpha=.6, color=COL[a], label=a)
ax[0].set_xlabel("Hari aktif"); ax[0].set_ylabel("Porsi nilai harian yang paling sering muncul")
ax[0].set_title("Keseragaman pola (mendekati 1 = angka itu-itu saja)"); ax[0].legend()
for a in COL:
    s = f[(f.agen == a) & (f.hari_aktif >= 5)]
    ax[1].scatter(s.rerata_hari_aktif, s.cv_harian, s=20, alpha=.6, color=COL[a], label=a)
ax[1].set_xlabel("Rerata volume pada hari aktif"); ax[1].set_ylabel("Koefisien variasi harian")
ax[1].set_title("Variasi harian vs ukuran penyaluran"); ax[1].legend()
fig.tight_layout(); fig.savefig(f"{OUT}/g6_pola_seragam_variasi.png"); plt.close(fig)

# 7. korelasi fitur
cols = ["total_hitung", "hari_aktif", "rerata_hari_aktif", "cv_harian", "porsi_hari_puncak",
        "rasio_puncak_rerata", "porsi_nilai_dominan", "utilisasi"]
cm = f[cols].corr(method="spearman")
fig, ax = plt.subplots(figsize=(7.5, 6))
im = ax.imshow(cm, cmap="RdBu_r", vmin=-1, vmax=1)
ax.set_xticks(range(len(cols))); ax.set_xticklabels(cols, rotation=45, ha="right")
ax.set_yticks(range(len(cols))); ax.set_yticklabels(cols)
for i in range(len(cols)):
    for j in range(len(cols)):
        ax.text(j, i, f"{cm.iloc[i, j]:.2f}", ha="center", va="center", fontsize=7)
ax.set_title("Korelasi Spearman antar fitur eksplorasi"); fig.colorbar(im, fraction=.046)
fig.tight_layout(); fig.savefig(f"{OUT}/g7_korelasi_fitur.png"); plt.close(fig)
cm.round(2).to_csv(f"{OUT}/korelasi_fitur.csv")

# ------------------------------------------------------------ cetak temuan kunci
pd.set_option("display.width", 200)
print(ringkas.round(2).to_string())
print("\n", kec.to_string())
g = f[f.alokasi.notna()]
print("\nUtilisasi>1:", g.groupby("agen").apply(lambda s: f"{(s.utilisasi>1).sum()}/{len(s)}").to_dict())
print("Utilisasi>2:", g.groupby("agen").apply(lambda s: f"{(s.utilisasi>2).sum()}/{len(s)}").to_dict())
print("\nTop 10 utilisasi:\n", g.nlargest(10, "utilisasi")[["agen", "nama_pangkalan", "alokasi", "total_hitung", "utilisasi"]].to_string())
print("\nLonjakan satu hari (porsi puncak>0.4, total>0):\n",
      f[(f.porsi_hari_puncak > .4) & (f.total_hitung > 0)][["agen", "nama_pangkalan", "total_hitung", "hari_aktif", "maks_harian", "porsi_hari_puncak"]].to_string())
print("\nSangat seragam (dominan>=0.9, aktif>=8):\n",
      f[(f.porsi_nilai_dominan >= .9) & (f.hari_aktif >= 8)].groupby("agen").size().to_dict())
print("Hari aktif median per agen:", f.groupby("agen").hari_aktif.median().to_dict())
print("Skewness total:", f.groupby("agen").total_hitung.apply(lambda s: round(s.skew(), 2)).to_dict())
q1, q3 = f.total_hitung.quantile([.25, .75]); iqr = q3 - q1
print("Outlier IQR (semua):", int((f.total_hitung > q3 + 1.5 * iqr).sum()), "batas", q3 + 1.5 * iqr)
print("Alokasi KJP unik:", f[f.agen == 'KJP'].alokasi.unique(), "| Alokasi modus:", g.alokasi.mode().tolist())
print("Round number (total kelipatan 5):", round((f.total_hitung % 5 == 0).mean(), 3))
