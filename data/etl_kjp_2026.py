"""
Ekstraksi laporan realisasi penyaluran agen KJP, Januari-Oktober 2026 (10 PDF)
Keluaran: kjp_2026_wide.csv, kjp_2026_validasi.csv
"""
import glob
import re
import sys
import pdfplumber
import pandas as pd

IN = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/uploads"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/mnt/user-data/outputs"
HARI = {1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31}
ID_RE = re.compile(r"^\d{13,17}$")
NUM_RE = re.compile(r"^-?[\d,]+$")
to_int = lambda s: int(str(s).replace(",", ""))

rows, val = [], []
for f in sorted(glob.glob(f"{IN}/Penyaluran_Harian_KABUPATEN_BINTAN_2026-*.pdf")):
    m = int(re.search(r"2026-(\d{2})", f).group(1))
    n = HARI[m]
    sub = []
    tot_row = None
    with pdfplumber.open(f) as pdf:
        judul = re.search(r"PERIODE\s+(\w+)\s+(\d{4})", (pdf.pages[0].extract_text() or ""))
        for pno, page in enumerate(pdf.pages, 1):
            words = page.extract_words()
            text = page.extract_text() or ""
            alok_x = min(w["x0"] for w in words if w["text"] == "Alokasi")
            idw = [w for w in words if ID_RE.match(w["text"]) and w["x0"] < 60]
            cen = [((w["top"] + w["bottom"]) / 2, w) for w in idw]
            if not cen:
                continue
            y0, y1 = min(c[0] for c in cen) - 9, max(c[0] for c in cen) + 9
            nmw = [w for w in words if 60 <= w["x0"] < alok_x - 6 and not ID_RE.match(w["text"])
                   and y0 <= (w["top"] + w["bottom"]) / 2 <= y1]
            for yc, w0 in cen:
                nums = [x["text"] for x in sorted(
                    [w for w in words if abs((w["top"] + w["bottom"]) / 2 - yc) < 3 and w["x0"] >= alok_x - 6],
                    key=lambda w: w["x0"]) if NUM_RE.match(x["text"])]
                if len(nums) != n + 5:
                    print("PERINGATAN", f.split("/")[-1], w0["text"], len(nums), "angka, harusnya", n + 5)
                    continue
                v = [to_int(x) for x in nums]
                nm = [w for w in nmw if min(cen, key=lambda c: abs(c[0] - (w["top"] + w["bottom"]) / 2))[0] == yc
                      and abs((w["top"] + w["bottom"]) / 2 - yc) < 14]
                nama = " ".join(w["text"] for w in sorted(nm, key=lambda w: (round(w["top"]), w["x0"])))
                r = {"bulan": m, "id_pangkalan": w0["text"], "nama_pangkalan": nama, "alokasi": v[0]}
                for i in range(n):
                    r[f"d{i+1:02d}"] = v[1 + i]
                for i in range(n, 31):
                    r[f"d{i+1:02d}"] = None
                r.update({"total_normal": v[n + 1], "total_fakultatif": v[n + 2], "sisa_alokasi": v[n + 3], "grand_total": v[n + 4]})
                sub.append(r)
            for line in text.split("\n"):
                t = line.split()
                if len(t) == n + 5 and all(NUM_RE.match(x) for x in t) and not ID_RE.match(t[0]):
                    tot_row = [to_int(x) for x in t]
    rows += sub
    d = pd.DataFrame(sub)
    dc = [f"d{i+1:02d}" for i in range(n)]
    ok_baris = int((d[dc].sum(axis=1) == d.total_normal).sum())
    ok_gt = int((d.total_normal + d.total_fakultatif == d.grand_total).sum())
    ok_sisa = int((d.alokasi - d.grand_total == d.sisa_alokasi).sum())
    v = {"bulan": m, "pangkalan": len(d), "baris_jumlah_harian=total_normal": f"{ok_baris}/{len(d)}",
         "normal+fakultatif=grand": f"{ok_gt}/{len(d)}", "sisa=alokasi-grand": f"{ok_sisa}/{len(d)}",
         "total_normal_hitung": int(d.total_normal.sum()), "total_normal_pdf": tot_row[n + 1] if tot_row else None,
         "alokasi_hitung": int(d.alokasi.sum()), "alokasi_pdf": tot_row[0] if tot_row else None,
         "fakultatif": int(d.total_fakultatif.sum())}
    val.append(v)

w = pd.DataFrame(rows)
w.to_csv(f"{OUT}/kjp_2026_wide.csv", index=False)
v = pd.DataFrame(val)
v.to_csv(f"{OUT}/kjp_2026_validasi.csv", index=False)
pd.set_option("display.width", 250)
print(v.to_string(index=False))
print(w.groupby("bulan").id_pangkalan.nunique().to_dict())
