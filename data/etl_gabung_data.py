"""
ETL Penyatuan Data Mentah - Proyek Penambangan Data (Penyaluran LPG 3 Kg, Kab. Bintan)

Sumber : KPG.pdf, KJP.pdf (laporan Pertamina), BGJS.xlsx, MCAM.xlsx
Keluaran:
  master_pangkalan_wide.csv   -> 1 baris per pangkalan (kolom d01..d30)
  master_harian_long.csv      -> 1 baris per pangkalan per hari
  validasi_ekstraksi.csv      -> hasil cek total (per pangkalan & per agen)
  log_temuan_data.csv         -> daftar masalah data (bahan Bab II/III)

Jalankan: python etl_gabung_data.py <folder_input> <folder_output>
"""
import re
import sys
import datetime as dt
import pandas as pd
import pdfplumber

IN = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/uploads"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/mnt/user-data/outputs"
DAYS = [f"d{i:02d}" for i in range(1, 31)]
SUNDAYS = [7, 14, 21, 28]  # April 2024 (KPG, KJP, BGJS)
SUNDAYS_MCAM = [3, 10, 17, 24]  # hari kosong MCAM (bulan lain; periode belum diketahui)
def minggu_days(agen):
    return SUNDAYS_MCAM if agen == "MCAM" else SUNDAYS
ID_RE = re.compile(r"^\d{13,17}$")
NUM_RE = re.compile(r"^-?[\d,]+$")
temuan = []  # log temuan


def log(sumber, jenis, detail):
    temuan.append({"sumber": sumber, "jenis": jenis, "detail": detail})


def to_int(s):
    return int(str(s).replace(",", ""))


# ---------------------------------------------------------------- PDF
def parse_pdf(path, kode_agen):
    rows, total_row, meta = [], None, {}
    with pdfplumber.open(path) as pdf:
        for pno, page in enumerate(pdf.pages, 1):
            words = page.extract_words()
            text = page.extract_text() or ""
            m = re.search(r"Nama Agen\s*:\s*(.+)", text)
            if m and "nama_agen" not in meta:
                meta["nama_agen"] = m.group(1).strip()
            m = re.search(r"Alamat Agen\s*:\s*(.+)", text)
            if m and "alamat_agen" not in meta:
                meta["alamat_agen"] = m.group(1).strip()
            alok_x = min(w["x0"] for w in words if w["text"] == "Alokasi")
            # baris data = kata ID di kolom paling kiri
            id_words = [w for w in words if ID_RE.match(w["text"]) and w["x0"] < 60]
            centers = [((w["top"] + w["bottom"]) / 2, w) for w in id_words]
            if not centers:
                continue
            y_min = min(c[0] for c in centers) - 9
            y_max = max(c[0] for c in centers) + 9
            name_words = [w for w in words if w["x0"] >= 60 and w["x0"] < alok_x - 6
                          and not ID_RE.match(w["text"])
                          and y_min <= (w["top"] + w["bottom"]) / 2 <= y_max]
            for yc, idw in centers:
                same = sorted([w for w in words if abs((w["top"] + w["bottom"]) / 2 - yc) < 3
                               and w["x0"] >= alok_x - 6], key=lambda w: w["x0"])
                nums = [w["text"] for w in same if NUM_RE.match(w["text"])]
                # nama: kata kolom nama terdekat ke baris ini
                nm = [w for w in name_words
                      if min(centers, key=lambda c: abs(c[0] - (w["top"] + w["bottom"]) / 2))[0] == yc
                      and abs((w["top"] + w["bottom"]) / 2 - yc) < 14]
                nm = sorted(nm, key=lambda w: (round(w["top"]), w["x0"]))
                nama = " ".join(w["text"] for w in nm).strip()
                if len(nums) != 35:
                    log(path, "Baris PDF gagal terbaca",
                        f"ID {idw['text']} halaman {pno}: {len(nums)} angka (harus 35)")
                    continue
                v = [to_int(x) for x in nums]
                rows.append({"agen": kode_agen, "sumber_file": path.split("/")[-1],
                             "id_pangkalan": idw["text"], "nama_pangkalan": nama,
                             "kecamatan": None, "kelurahan": None, "alokasi": v[0],
                             **{DAYS[i]: v[1 + i] for i in range(30)},
                             "total_dilaporkan": v[31], "sisa_alokasi_dilaporkan": v[33]})
            # baris total agen: baris tanpa ID dengan >= 35 angka
            for line in text.split("\n"):
                toks = line.split()
                if len(toks) >= 35 and all(NUM_RE.match(t) for t in toks) and not ID_RE.match(toks[0]):
                    total_row = [to_int(t) for t in toks]
    return pd.DataFrame(rows), total_row, meta


# ---------------------------------------------------------------- Excel
def parse_bgjs(path):
    df = pd.read_excel(path, dtype={"Id Registrasi": str})
    global bgjs_tot
    bgjs_tot = df[df["Id Registrasi"].isna() & df["Nama Pangkalan"].astype(str).str.upper().eq("TOTAL")]
    log(path.split("/")[-1], "Baris total ikut di dalam tabel", "Baris 'Total' dibuang dari data dan dipakai untuk validasi")
    df = df[df["Id Registrasi"].notna()].copy()
    date_cols = [c for c in df.columns if str(c).startswith("2024-")]
    out = pd.DataFrame({
        "agen": "BGJS", "sumber_file": "BGJS.xlsx",
        "id_pangkalan": df["Id Registrasi"].str.strip(),
        "nama_pangkalan": df["Nama Pangkalan"].astype(str).str.strip(),
        "kecamatan": df["Kecamatan"], "kelurahan": df["Kelurahan"],
        "alokasi": df["Alokasi"]})
    for i, c in enumerate(date_cols):
        out[DAYS[i]] = pd.to_numeric(df[c], errors="coerce").fillna(0).astype(int).values
    out["total_dilaporkan"] = df["Total Normal"].values
    out["sisa_alokasi_dilaporkan"] = df["Sisa Alokasi"].values
    return out.reset_index(drop=True)


def parse_mcam(path):
    raw = pd.read_excel(path, sheet_name="agen ke pangkalan", header=None, skiprows=2)
    raw = raw[pd.to_numeric(raw[0], errors="coerce").notna()].copy()
    days = raw.iloc[:, 8:38].apply(pd.to_numeric, errors="coerce")
    blank = int(days.isna().sum().sum())
    out = pd.DataFrame({
        "agen": "MCAM", "sumber_file": "MCAM.xlsx",
        "id_pangkalan": raw[2].astype(str).str.strip(),
        "nama_pangkalan": raw[1].astype(str).str.strip(),
        "kecamatan": raw[5].astype(str).str.strip(),
        "kelurahan": raw[4].astype(str).str.strip(),
        "alokasi": pd.NA})
    for i in range(30):
        out[DAYS[i]] = days.iloc[:, i].fillna(0).astype(int).values
    out["total_dilaporkan"] = pd.to_numeric(raw[38], errors="coerce").values
    out["sisa_alokasi_dilaporkan"] = pd.NA
    log("MCAM.xlsx", "Sel kosong = tidak ada penyaluran",
        f"{blank} sel harian kosong diisi 0 (asumsi: kosong berarti tidak ada penyaluran)")
    log("MCAM.xlsx", "Data pribadi", "Kolom HP dan alamat pangkalan tidak dibawa ke tabel master (anonimisasi)")
    return out.reset_index(drop=True)


# ---------------------------------------------------------------- Jalankan
kpg, kpg_tot, kpg_meta = parse_pdf(f"{IN}/KPG.pdf", "KPG")
kjp, kjp_tot, kjp_meta = parse_pdf(f"{IN}/KJP.pdf", "KJP")
bgjs = parse_bgjs(f"{IN}/BGJS.xlsx")
mcam = parse_mcam(f"{IN}/MCAM.xlsx")
master = pd.concat([kpg, kjp, bgjs, mcam], ignore_index=True)

# ---- standarisasi kecamatan
KEC_MAP = {"telok sebong": "Teluk Sebong", "teluk sebung": "Teluk Sebong", "teluk sebong": "Teluk Sebong",
           "bintanutara": "Bintan Utara", "bintan utara": "Bintan Utara"}
raw_kec = master["kecamatan"].copy()
master["kecamatan"] = master["kecamatan"].apply(
    lambda s: None if pd.isna(s) or str(s).lower() == "nan"
    else KEC_MAP.get(str(s).strip().lower(), str(s).strip().title()))
chg = master[raw_kec.notna() & (raw_kec.str.strip().str.title() != master["kecamatan"])]
for old, new in chg.assign(old=raw_kec)[["old", "kecamatan"]].drop_duplicates().itertuples(index=False):
    log("MCAM/BGJS", "Nama kecamatan tidak konsisten", f"'{old}' diseragamkan menjadi '{new}'")
master["kelurahan"] = master["kelurahan"].apply(lambda s: None if pd.isna(s) else str(s).strip().title())
master["nama_pangkalan"] = master["nama_pangkalan"].str.replace(r"\s+", " ", regex=True).str.strip()
master["alokasi"] = pd.to_numeric(master["alokasi"], errors="coerce")

log("MCAM.xlsx", "Periode data tidak sesuai agen lain",
    "Hari tanpa penyaluran jatuh pada tanggal 3,10,17,24 (bukan 7,14,21,28 seperti April 2024); periode MCAM harus dikonfirmasi")
log("KPG.pdf, KJP.pdf", "Kecamatan pangkalan tidak tersedia", "Laporan Pertamina hanya memuat alamat agen, bukan kecamatan tiap pangkalan")
log("KPG.pdf", "Alamat agen ambigu", "Alamat memuat KEL. KIJANG KOTA sekaligus KEC. BUKIT BESTARI; perlu konfirmasi")
log("KJP.pdf", "Total harian seragam", "Jumlah penyaluran seluruh pangkalan tepat 560 tabung hampir setiap hari aktif (1.120 pada tgl 08); perlu klarifikasi")
log("BGJS.xlsx", "Hari kosong di luar Minggu", "Tanggal 10 April 2024 bernilai 0 untuk semua pangkalan BGJS (kemungkinan libur nasional)")
log("PDF/Excel", "Alokasi tidak seragam antar sumber", "MCAM tidak punya kolom alokasi; semua pangkalan KJP beralokasi 300")

# ---- turunan & validasi per pangkalan
master["total_hitung"] = master[DAYS].sum(axis=1)
master["selisih_total"] = master["total_hitung"] - master["total_dilaporkan"]
master["hari_minggu_terisi"] = master.apply(
    lambda r: sum(r[f"d{d:02d}"] for d in minggu_days(r["agen"])), axis=1)
master["periode"] = master["agen"].apply(lambda a: "tidak diketahui" if a == "MCAM" else "2024-04")
master["periode_terverifikasi"] = master["agen"] != "MCAM"
master.insert(0, "id_baris", range(1, len(master) + 1))

bad = master[master["selisih_total"] != 0]
for r in bad.itertuples():
    log(r.sumber_file, "Total tidak cocok",
        f"{r.nama_pangkalan} ({r.id_pangkalan}): hitung={r.total_hitung}, dilaporkan={r.total_dilaporkan}")
_len = master["id_pangkalan"].str.len()
_mode = master.groupby("agen")["id_pangkalan"].transform(lambda x: x.str.len().mode()[0])
for r in master[_len != _mode].itertuples():
    log(r.sumber_file, "Panjang ID registrasi tidak lazim", f"{r.nama_pangkalan}: {r.id_pangkalan} ({len(r.id_pangkalan)} digit)")
dup = master[master["id_pangkalan"].duplicated(keep=False)]
for r in dup.itertuples():
    log(r.sumber_file, "ID registrasi ganda", f"{r.id_pangkalan} {r.nama_pangkalan}")
for r in master[master["total_hitung"] == 0].itertuples():
    log(r.sumber_file, "Pangkalan tanpa penyaluran sebulan", f"{r.nama_pangkalan} (alokasi={r.alokasi})")
for r in master[master["hari_minggu_terisi"] > 0].itertuples():
    log(r.sumber_file, "Penyaluran pada hari libur mingguan", f"{r.nama_pangkalan}: {r.hari_minggu_terisi} tabung")
dn = master[master.duplicated(["nama_pangkalan", "agen"], keep=False)]
for r in dn.itertuples():
    log(r.sumber_file, "Nama pangkalan ganda dalam agen", f"{r.nama_pangkalan} ({r.id_pangkalan})")

# ---- validasi per agen terhadap baris total PDF
val = []
for kode, tot in [("KPG", kpg_tot), ("KJP", kjp_tot)]:
    sub = master[master["agen"] == kode]
    if tot is None:
        continue
    alok_pdf, harian_pdf, tn_pdf = tot[0], tot[1:31], tot[31]
    val.append({"agen": kode, "cek": "jumlah alokasi", "hitung": int(sub["alokasi"].sum()), "pdf": alok_pdf})
    val.append({"agen": kode, "cek": "total normal", "hitung": int(sub["total_hitung"].sum()), "pdf": tn_pdf})
    for i, d in enumerate(DAYS):
        s = int(sub[d].sum())
        val.append({"agen": kode, "cek": f"total harian {d}", "hitung": s, "pdf": harian_pdf[i]})
for kode in ["BGJS", "MCAM"]:
    sub = master[master["agen"] == kode]
    val.append({"agen": kode, "cek": "total normal vs kolom Total file",
                "hitung": int(sub["total_hitung"].sum()), "pdf": int(pd.to_numeric(sub["total_dilaporkan"]).sum())})
if len(bgjs_tot):
    bt = bgjs_tot.iloc[0]
    sub = master[master["agen"] == "BGJS"]
    val.append({"agen": "BGJS", "cek": "jumlah alokasi", "hitung": int(sub["alokasi"].sum()), "pdf": int(bt["Alokasi"])})
    val.append({"agen": "BGJS", "cek": "total normal (vs baris Total)", "hitung": int(sub["total_hitung"].sum()), "pdf": int(bt["Total Normal"])})
val = pd.DataFrame(val)
val["selisih"] = val["hitung"] - val["pdf"]
val["status"] = val["selisih"].apply(lambda x: "COCOK" if x == 0 else "BEDA")
for r in val[val["status"] == "BEDA"].itertuples():
    log(r.agen, "Total agen tidak cocok dengan baris total sumber",
        f"{r.cek}: hitung={r.hitung}, sumber={r.pdf}, selisih={r.selisih}")

# ---- wide & long
wide_cols = ["id_baris", "agen", "sumber_file", "id_pangkalan", "nama_pangkalan", "kecamatan", "kelurahan",
             "alokasi", "periode", "periode_terverifikasi"] + DAYS + \
            ["total_dilaporkan", "total_hitung", "selisih_total", "sisa_alokasi_dilaporkan"]
wide = master[wide_cols]
long = wide.melt(id_vars=["id_baris", "agen", "id_pangkalan", "nama_pangkalan", "kecamatan", "kelurahan",
                          "alokasi", "periode", "periode_terverifikasi"],
                 value_vars=DAYS, var_name="hari", value_name="volume")
long["hari"] = long["hari"].str[1:].astype(int)
long["tanggal"] = long.apply(
    lambda r: None if r["agen"] == "MCAM" else dt.date(2024, 4, int(r["hari"])), axis=1)
long["hari_libur_mingguan"] = long.apply(lambda r: r["hari"] in minggu_days(r["agen"]), axis=1)
long = long.sort_values(["id_baris", "hari"]).reset_index(drop=True)

wide.to_csv(f"{OUT}/master_pangkalan_wide.csv", index=False)
long.to_csv(f"{OUT}/master_harian_long.csv", index=False)
val.to_csv(f"{OUT}/validasi_ekstraksi.csv", index=False)
pd.DataFrame(temuan).to_csv(f"{OUT}/log_temuan_data.csv", index=False)

print("Pangkalan per agen:\n", master["agen"].value_counts().to_string())
print("Total baris wide:", len(wide), "| long:", len(long))
print("Meta KPG:", kpg_meta, "\nMeta KJP:", kjp_meta)
print("\nValidasi (hanya BEDA):\n", val[val.status == "BEDA"].to_string())
print("\nRingkasan validasi:", val["status"].value_counts().to_dict())
print("Selisih total per pangkalan != 0:", len(bad))
