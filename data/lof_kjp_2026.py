"""
LOF per bulan - KJP Januari-Oktober 2026 (Bab IV-V)
Unit      : pangkalan x bulan
Fitur     : log_total, cv_harian, rasio_hari_aktif, porsi_nilai_dominan (alokasi TIDAK masuk model)
Normalisasi: z-score robust (median, MAD) per bulan  -> jarak berbasis deviasi
Model     : LocalOutlierFactor (euclidean) per bulan
Klasifikasi: konsistensi tanda anomali antarbulan
"""
import datetime as dt
import os
import sys
import warnings
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.neighbors import LocalOutlierFactor
from scipy.stats import spearmanr

warnings.filterwarnings("ignore")
DIR = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/outputs"
OUT = f"{DIR}/lof_kjp_2026"
os.makedirs(OUT, exist_ok=True)
K, THR = 10, 1.5
FIT = ["log_total", "cv_harian", "rasio_hari_aktif", "porsi_nilai_dominan"]
BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt"]
HARI = {1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31}

w = pd.read_csv(f"{DIR}/kjp_2026_wide.csv", dtype={"id_pangkalan": str})


def hari_kerja(m):
    return [d for d in range(1, HARI[m] + 1) if dt.date(2026, m, d).weekday() != 6]


def fitur_vec(v):
    v = np.asarray(v, float)
    nz = v[v > 0]
    o = {"total": v.sum(), "hari_aktif": len(nz), "rasio_hari_aktif": len(nz) / len(v)}
    if len(nz):
        _, c = np.unique(nz, return_counts=True)
        o["cv_harian"] = nz.std() / nz.mean() if len(nz) > 1 else 0.0
        o["porsi_nilai_dominan"] = c.max() / len(nz)
        o["porsi_hari_puncak"] = v.max() / v.sum()
    else:
        o["cv_harian"] = o["porsi_nilai_dominan"] = o["porsi_hari_puncak"] = np.nan
    o["log_total"] = np.log1p(v.sum())
    return o


# ---- 1. fitur per pangkalan-bulan + cek hari Minggu
rows, mgg = [], 0
for r in w.itertuples(index=False):
    m = r.bulan
    kerja = hari_kerja(m)
    vals = [getattr(r, f"d{d:02d}") for d in kerja]
    mgg += sum(getattr(r, f"d{d:02d}") for d in range(1, HARI[m] + 1) if d not in kerja)
    f = fitur_vec(vals)
    f.update({"bulan": m, "id_pangkalan": r.id_pangkalan, "nama_pangkalan": r.nama_pangkalan,
              "alokasi": r.alokasi, "grand_total": r.grand_total, "total_fakultatif": r.total_fakultatif,
              "sisa_alokasi": r.sisa_alokasi, "n_hari_kerja": len(kerja)})
    rows.append(f)
F = pd.DataFrame(rows)
print("Total tabung pada hari Minggu:", int(mgg))


# ---- 2. normalisasi per bulan + LOF
def zrobust(x):
    med = x.median()
    mad = (x - med).abs().median() * 1.4826
    if mad == 0:
        mad = x.std(ddof=0)
    return (x - med) / mad if mad and not np.isnan(mad) else x * 0


def jalankan(F, fit=FIT, k=K):
    out = F.copy()
    out["lof"] = np.nan
    for m, g in out[out.total > 0].groupby("bulan"):
        Z = pd.DataFrame({c: zrobust(g[c]) for c in fit}, index=g.index)
        kk = min(k, len(g) - 1)
        l = LocalOutlierFactor(n_neighbors=kk, metric="euclidean").fit(Z.values)
        out.loc[g.index, "lof"] = -l.negative_outlier_factor_
        for c in fit:
            out.loc[g.index, "z_" + c] = Z[c]
    return out


S = jalankan(F)
S["flag_lof"] = S.lof >= THR
print("\nJumlah pangkalan-bulan valid:", int(S.lof.notna().sum()), "| dikecualikan (nol sebulan):", int((S.total == 0).sum()))
print("Distribusi LOF:", S.lof.describe().round(2).to_dict())
print("Flag LOF>=%.1f per bulan:" % THR, S.groupby("bulan").flag_lof.sum().to_dict())

# ---- 3. flag aturan
S["r_realisasi_gt_alokasi"] = (S.grand_total > S.alokasi) & (S.bulan != 2)       # Feb: alokasi tidak reliabel
S["r_gt_2x_alokasi"] = (S.grand_total > 2 * S.alokasi) & (S.bulan != 2)
S["r_nol_sebulan"] = S.total == 0
S["r_lonjakan_satu_hari"] = (S.porsi_hari_puncak > 0.4) & (S.hari_aktif <= 3)
S["r_pola_seragam"] = (S.porsi_nilai_dominan >= 0.9) & (S.hari_aktif >= 8)
S["r_fakultatif"] = S.total_fakultatif > 0
S.drop(columns=["porsi_hari_puncak"]).to_csv(f"{OUT}/kjp_2026_lof_per_bulan.csv", index=False)

# ---- 4. klasifikasi per pangkalan (konsistensi antarbulan)
def klas(g):
    v = g.lof.notna()
    n = int(v.sum())
    nflag = int(g.flag_lof.sum())
    f = nflag / n if n else np.nan
    flags = g.sort_values("bulan").set_index("bulan").flag_lof.reindex(range(1, 11)).fillna(False).astype(bool).tolist()
    run = mx = 0
    for fl in flags:
        run = run + 1 if fl else 0
        mx = max(mx, run)
    if n == 0:
        j = "Tidak dinilai (nol sepanjang waktu)"
    elif n < 4:
        j = "Data kurang (<4 bulan valid)"
    elif nflag == 0:
        j = "Normal"
    elif f <= 0.3:
        j = "Sporadis (anomali)"
    elif f < 0.7:
        j = "Berulang (sedang)"
    else:
        j = "Konsisten tinggi (profil khusus)"
    bl = [BLN[int(b) - 1] for b in g[g.flag_lof].bulan]
    return pd.Series({"nama_pangkalan": g.nama_pangkalan.iloc[0], "bulan_valid": n, "bulan_flag_lof": nflag,
                      "proporsi_flag": round(f, 2) if n else np.nan, "rerata_lof": round(g.lof.mean(), 2),
                      "maks_lof": round(g.lof.max(), 2), "bulan_maks": BLN[int(g.loc[g.lof.idxmax(), "bulan"]) - 1] if n else None,
                      "bulan_yang_ditandai": ", ".join(bl), "run_bulan_berurutan_terpanjang": mx, "kategori_lof": j,
                      "bulan_realisasi_gt_alokasi(tanpa Feb)": int(g.r_realisasi_gt_alokasi.sum()),
                      "bulan_gt_2x_alokasi(tanpa Feb)": int(g.r_gt_2x_alokasi.sum()),
                      "bulan_pola_seragam": int(g.r_pola_seragam.sum()), "bulan_lonjakan_satu_hari": int(g.r_lonjakan_satu_hari.sum()),
                      "bulan_nol": int(g.r_nol_sebulan.sum()), "bulan_fakultatif": int(g.r_fakultatif.sum())})


C = S.groupby("id_pangkalan").apply(klas).reset_index()
urut = {"Sporadis (anomali)": 0, "Berulang (sedang)": 1, "Konsisten tinggi (profil khusus)": 2, "Normal": 3, "Tidak dinilai (nol sepanjang waktu)": 4, "Data kurang (<4 bulan valid)": 5}
C = C.sort_values(by=["kategori_lof", "maks_lof"], key=lambda s: s.map(urut) if s.name == "kategori_lof" else -s)
C.to_csv(f"{OUT}/kjp_2026_klasifikasi_pangkalan.csv", index=False)
print("\nKategori:", C.kategori_lof.value_counts().to_dict())
pd.set_option("display.width", 250); pd.set_option("display.max_colwidth", 40)
print(C[C.kategori_lof != "Normal"][["nama_pangkalan", "bulan_valid", "bulan_flag_lof", "rerata_lof", "maks_lof", "bulan_yang_ditandai", "run_bulan_berurutan_terpanjang", "kategori_lof"]].to_string(index=False))

# ---- 5. evaluasi
ev = []
# (a) sensitivitas k
base = S.set_index(["id_pangkalan", "bulan"]).lof
for k in (5, 8, 10, 15):
    t = jalankan(F, k=k).set_index(["id_pangkalan", "bulan"]).lof
    ok = base.notna() & t.notna()
    rho = spearmanr(base[ok], t[ok])[0]
    a, b = set(base[base >= THR].index), set(t[t >= THR].index)
    ev.append({"uji": f"sensitivitas k={k} vs k=10", "ukuran": "Spearman skor", "nilai": round(rho, 2)})
    ev.append({"uji": f"sensitivitas k={k} vs k=10", "ukuran": "Jaccard tanda anomali", "nilai": round(len(a & b) / max(len(a | b), 1), 2)})
# (b) hapus satu fitur
for c in FIT:
    fit2 = [x for x in FIT if x != c]
    t = jalankan(F, fit=fit2).set_index(["id_pangkalan", "bulan"]).lof
    ok = base.notna() & t.notna()
    ev.append({"uji": f"tanpa fitur {c}", "ukuran": "Spearman skor", "nilai": round(spearmanr(base[ok], t[ok])[0], 2)})
# (c) konsistensi antarbulan: korelasi LOF bulan t dengan t+1
P = S.pivot(index="id_pangkalan", columns="bulan", values="lof")
rr = [P[[m, m + 1]].dropna().corr(method="spearman").iloc[0, 1] for m in range(1, 10)]
ev.append({"uji": "konsistensi antarbulan", "ukuran": "Spearman LOF bulan t vs t+1 (median)", "nilai": round(float(np.nanmedian(rr)), 2)})
ev.append({"uji": "konsistensi antarbulan", "ukuran": "Spearman LOF bulan t vs t+1 (min)", "nilai": round(float(np.nanmin(rr)), 2)})
# (d) kesepakatan LOF dengan aturan
S["ada_aturan"] = S[["r_gt_2x_alokasi", "r_lonjakan_satu_hari", "r_pola_seragam"]].any(axis=1)
tab = pd.crosstab(S.flag_lof[S.lof.notna()], S.ada_aturan[S.lof.notna()])
ev.append({"uji": "LOF vs aturan", "ukuran": "% tanda LOF yang punya aturan (2x alokasi/lonjakan/seragam)",
           "nilai": round(float(tab.loc[True, True] / tab.loc[True].sum()), 2) if True in tab.index and True in tab.columns else np.nan})
# (e) injeksi sintetis
rng = np.random.default_rng(42)
hasil = {"lonjakan_satu_hari": [], "volume_x3": [], "pola_seragam": []}
fp = []
for run in range(30):
    Fs = F.copy()
    inj = {}
    for m in range(1, 11):
        kandidat = Fs[(Fs.bulan == m) & (Fs.total > 0)].index
        pilih = rng.choice(kandidat, size=3, replace=False)
        for tipe, idx in zip(hasil, pilih):
            r = w[(w.bulan == m) & (w.id_pangkalan == Fs.loc[idx, "id_pangkalan"])].iloc[0]
            v = np.array([r[f"d{d:02d}"] for d in hari_kerja(m)], float)
            if tipe == "lonjakan_satu_hari":
                tot = v.sum(); v2 = np.zeros_like(v); v2[rng.integers(len(v))] = tot * 1.0
            elif tipe == "volume_x3":
                v2 = v * 3
            else:
                nz = v[v > 0]; v2 = np.where(v > 0, np.round(nz.mean()), 0)
            f = fitur_vec(v2)
            for c in ["total", "hari_aktif", "rasio_hari_aktif", "cv_harian", "porsi_nilai_dominan", "log_total"]:
                Fs.loc[idx, c] = f[c]
            inj[idx] = tipe
    Ss = jalankan(Fs)
    Ss["flag"] = Ss.lof >= THR
    for idx, tipe in inj.items():
        hasil[tipe].append(bool(Ss.loc[idx, "flag"]))
    tdk = Ss[~Ss.index.isin(inj) & Ss.lof.notna()]
    fp.append(tdk.flag.mean())
for tipe, h in hasil.items():
    ev.append({"uji": "injeksi sintetis (30 ulangan x 10 bulan)", "ukuran": f"recall {tipe}", "nilai": round(float(np.mean(h)), 2)})
tp = sum(sum(h) for h in hasil.values()); n_inj = sum(len(h) for h in hasil.values())
fpr = float(np.mean(fp))
n_valid_per_bulan = S.groupby("bulan").lof.count().mean()
prec = tp / (tp + fpr * (n_valid_per_bulan - 3) * 10 * 30)
ev.append({"uji": "injeksi sintetis (30 ulangan x 10 bulan)", "ukuran": "recall keseluruhan", "nilai": round(tp / n_inj, 2)})
ev.append({"uji": "injeksi sintetis (30 ulangan x 10 bulan)", "ukuran": "tingkat tanda pada pangkalan tak disisipi (FPR kasar)", "nilai": round(fpr, 2)})
ev.append({"uji": "injeksi sintetis (30 ulangan x 10 bulan)", "ukuran": "precision (kasar)", "nilai": round(prec, 2)})
E = pd.DataFrame(ev)
E.to_csv(f"{OUT}/evaluasi_lof.csv", index=False)
print("\nEvaluasi:\n", E.to_string(index=False))

# ---- 6. gambar
plt.rcParams.update({"figure.dpi": 150, "font.size": 9, "axes.spines.top": False, "axes.spines.right": False})
H = S.pivot(index="id_pangkalan", columns="bulan", values="lof")
nm = S.drop_duplicates("id_pangkalan").set_index("id_pangkalan").nama_pangkalan
H = H.loc[C.id_pangkalan.tolist()]
fig, ax = plt.subplots(figsize=(8.5, 9))
im = ax.imshow(H.values, aspect="auto", cmap="YlOrRd", vmin=1, vmax=3)
ax.set_xticks(range(10)); ax.set_xticklabels(BLN); ax.set_yticks(range(len(H)))
ax.set_yticklabels([f"P{i+1:02d}" for i in range(len(H))], fontsize=7)
for i in range(H.shape[0]):
    for j in range(H.shape[1]):
        v = H.values[i, j]
        if np.isnan(v):
            ax.text(j, i, "-", ha="center", va="center", fontsize=6, color="grey")
        elif v >= THR:
            ax.text(j, i, f"{v:.1f}", ha="center", va="center", fontsize=6)
ax.set_title("Skor LOF per pangkalan per bulan (KJP 2026)\nAngka tampil bila LOF \u2265 1,5; baris diurut menurut kategori")
fig.colorbar(im, fraction=.03, label="LOF")
fig.tight_layout(); fig.savefig(f"{OUT}/g_lof_heatmap.png"); plt.close(fig)

fig, ax = plt.subplots(figsize=(7, 4.5))
col = {"Sporadis (anomali)": "#C44E52", "Berulang (sedang)": "#DD8452", "Konsisten tinggi (profil khusus)": "#8172B3", "Normal": "#4C72B0", "Tidak dinilai (nol sepanjang waktu)": "#999999", "Data kurang (<4 bulan valid)": "#BBBBBB"}
for k_, g in C.groupby("kategori_lof"):
    ax.scatter(g.proporsi_flag.fillna(0), g.maks_lof.fillna(0), s=35, color=col[k_], label=f"{k_} ({len(g)})", alpha=.8)
ax.axvline(.3, ls=":", c="grey"); ax.axvline(.7, ls=":", c="grey"); ax.axhline(THR, ls="--", c="k", lw=.8)
ax.set_xlabel("Proporsi bulan yang ditandai LOF"); ax.set_ylabel("LOF tertinggi")
ax.set_title("Klasifikasi pangkalan menurut konsistensi anomali"); ax.legend(fontsize=7)
fig.tight_layout(); fig.savefig(f"{OUT}/g_lof_klasifikasi.png"); plt.close(fig)
