import datetime as dt, re, numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
DIR="/mnt/user-data/outputs"; OUT=f"{DIR}/eda_kjp_2026"
HARI={1:31,2:28,3:31,4:30,5:31,6:30,7:31,8:31,9:30,10:31}
BLN=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt"]
w=pd.read_csv(f"{DIR}/kjp_2026_wide.csv",dtype={"id_pangkalan":str})
D=[f"d{i:02d}" for i in range(1,32)]
w["n_hari"]=w.bulan.map(HARI)
def kerja(m): return [d for d in range(1,HARI[m]+1) if dt.date(2026,m,d).weekday()!=6]
def stat(r):
    v=np.array([r[f"d{d:02d}"] for d in kerja(r.bulan)],float); nz=v[v>0]
    return pd.Series({"aktif":len(nz),"n_kerja":len(v),"dom":(np.unique(nz,return_counts=True)[1].max()/len(nz)) if len(nz) else np.nan,"puncak":v.max()/v.sum() if v.sum() else np.nan})
w=pd.concat([w,w.apply(stat,axis=1)],axis=1)
print("observasi pangkalan-bulan:",len(w),"| pangkalan-hari:",int(w.n_hari.sum()),"| pangkalan unik:",w.id_pangkalan.nunique())
print("nama per ID >1:",(w.groupby("id_pangkalan").nama_pangkalan.nunique()>1).sum())
m=w.groupby("bulan").agg(pangkalan=("id_pangkalan","count"),total_normal=("total_normal","sum"),fakultatif=("total_fakultatif","sum"),grand=("grand_total","sum"),alokasi=("alokasi","sum"),minus=("sisa_alokasi",lambda s:int((s<0).sum())),aktif_median=("aktif","median"),nol=("grand_total",lambda s:int((s==0).sum())))
m["rit_normal"]=(m.total_normal/560).round(2); m["utilisasi"]=(m.grand/m.alokasi).round(2)
m.index=BLN; print(m.to_string()); m.to_csv(f"{OUT}/ringkasan_per_bulan.csv")
# pangkalan level
p=w.pivot(index="id_pangkalan",columns="bulan",values="grand_total")
nm=w.drop_duplicates("id_pangkalan").set_index("id_pangkalan").nama_pangkalan
ps=pd.DataFrame({"nama":nm,"bulan_ada":p.notna().sum(axis=1),"rerata_bulanan":p.mean(axis=1).round(0),"median":p.median(axis=1),"cv_antarbulan":(p.std(axis=1)/p.mean(axis=1)).round(2)})
print(ps.rerata_bulanan.describe().round(0).to_dict(), "| cv median",ps.cv_antarbulan.median())
print("rerata bulanan min/maks:",ps.sort_values("rerata_bulanan").iloc[[0,1,-2,-1]][["nama","rerata_bulanan"]].to_string())
v=w[w.total_normal>0]
print("hari aktif per pangkalan-bulan: median",v.aktif.median(),"Q1/Q3",v.aktif.quantile([.25,.75]).tolist())
print("pola seragam (dom>=0.9 & aktif>=8):",int(((v.dom>=.9)&(v.aktif>=8)).sum()),"| dom median",round(v.dom.median(),2))
print("lonjakan satu hari:",int(((v.puncak>.4)&(v.aktif<=3)).sum()))
print("grand_total desc:",v.grand_total.describe().round(0).to_dict(),"skew",round(v.grand_total.skew(),2))
q1,q3=v.grand_total.quantile([.25,.75]); print("outlier IQR:",int((v.grand_total>q3+1.5*(q3-q1)).sum()),q3+1.5*(q3-q1))
nonfeb=w[(w.bulan!=2)]
print("alokasi nonFeb distribusi:",nonfeb.drop_duplicates('id_pangkalan').alokasi.value_counts().sort_index().to_dict())
print("Feb: alokasi unik",sorted(w[w.bulan==2].alokasi.unique()),"minus",int((w[w.bulan==2].sisa_alokasi<0).sum()))
print("fakultatif>0 pangkalan-bulan:",int((w.total_fakultatif>0).sum()),"dari",len(w),"| bulan terisi:",m.index[m.fakultatif>0].tolist())
print("rekap vs grand Jan-Jun:",(m.grand[:6]/1.0).tolist(),"rekap tabung [16800,15120,16800,15680,15680,16240]")
print("pangkalan sisa<0 per pangkalan >=5 bulan:",(w.groupby('id_pangkalan').sisa_alokasi.apply(lambda s:(s<0).sum())>=5).sum())
# figur
plt.rcParams.update({"figure.dpi":150,"font.size":9,"axes.spines.top":False,"axes.spines.right":False})
fig,ax=plt.subplots(figsize=(8,4)); x=range(10)
ax.bar(x,m.total_normal,color="#4C72B0",label="Normal (kolom harian)"); ax.bar(x,m.fakultatif,bottom=m.total_normal,color="#DD8452",label="Fakultatif")
ax.plot(x,m.alokasi,"k--",marker="o",ms=3,label="Total alokasi"); ax.set_xticks(x); ax.set_xticklabels(BLN); ax.set_ylabel("Tabung"); ax.set_title("Total penyaluran agen KJP per bulan, 2026"); ax.legend(fontsize=8)
fig.tight_layout(); fig.savefig(f"{OUT}/k1_total_per_bulan.png"); plt.close(fig)
fig,ax=plt.subplots(figsize=(8,5.5)); order=ps.sort_values("rerata_bulanan",ascending=False).index
H=p.loc[order]; im=ax.imshow(H.values,aspect="auto",cmap="YlOrRd"); ax.set_xticks(range(10)); ax.set_xticklabels(BLN); ax.set_yticks([]); ax.set_ylabel(f"{len(H)} pangkalan (diurut rerata bulanan menurun)")
ax.set_title("Total bulanan per pangkalan (Grand Total), KJP 2026"); fig.colorbar(im,label="tabung"); fig.tight_layout(); fig.savefig(f"{OUT}/k2_heatmap_bulanan.png"); plt.close(fig)
fig,ax=plt.subplots(1,2,figsize=(10,4)); ax[0].boxplot([w[w.bulan==b].grand_total for b in range(1,11)],labels=BLN); ax[0].set_title("Sebaran total per pangkalan tiap bulan"); ax[0].set_ylabel("Tabung")
r=(w.grand_total/w.alokasi.replace(0,np.nan)); ax[1].boxplot([r[w.bulan==b].dropna() for b in range(1,11)],labels=BLN); ax[1].axhline(1,ls="--",c="k",lw=.8); ax[1].set_title("Rasio realisasi/alokasi (Feb: alokasi \u2248 300 semua)")
fig.tight_layout(); fig.savefig(f"{OUT}/k3_sebaran_dan_rasio.png"); plt.close(fig)
ex=w[w.id_pangkalan==w[w.nama_pangkalan=="SUARMAN"].id_pangkalan.iloc[0]]
fig,ax=plt.subplots(figsize=(8,3.8)); ax.plot(range(10),ex.set_index("bulan").grand_total.reindex(range(1,11)).values,marker="o",label="Realisasi"); ax.plot(range(10),ex.set_index("bulan").alokasi.reindex(range(1,11)).values,"--",marker="s",label="Alokasi")
ax.set_xticks(range(10)); ax.set_xticklabels(BLN); ax.set_title("Contoh pangkalan A: realisasi vs alokasi per bulan"); ax.legend(); fig.tight_layout(); fig.savefig(f"{OUT}/k4_contoh_pangkalan.png"); plt.close(fig)
ps.to_csv(f"{OUT}/ringkasan_per_pangkalan.csv")
