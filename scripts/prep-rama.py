import numpy as np, base64, struct
d=np.load('/tmp/rama_raw.npz'); V,VT,F=d['V'],d['VT'],d['F']
key=F[:,:,0]*600000+F[:,:,1]
uk,inv=np.unique(key.reshape(-1),return_inverse=True)
cv=(uk//600000).astype(np.int64); ct=(uk%600000).astype(np.int64)
P=V[cv]; UV=VT[ct]; Fi=inv.reshape(-1,3)
x,y=P[:,0],P[:,1]
thr=np.where(y<0.6,0.235,np.where(y<0.93,0.28,np.where(y<1.12,9.0,0.30)))
Fi=Fi[~(x>thr)[Fi].all(1)]
cell=0.011
cs=np.where(y>1.5,cell*0.5,cell)
c=np.floor(P/cs[:,None]).astype(np.int64)
pk=((c[:,0]+2000)*4000+(c[:,1]+2000))*4000+(c[:,2]+2000)+(y>1.5).astype(np.int64)*10**12
uvc=np.floor(UV*40).astype(np.int64); ck=pk*4096+(uvc[:,0]%64)*64+(uvc[:,1]%64)
u,ci=np.unique(ck,return_inverse=True); n=len(u); cnt=np.bincount(ci,minlength=n)[:,None]
NP=np.stack([np.bincount(ci,P[:,k],n) for k in range(3)],1)/cnt
NUV=np.stack([np.bincount(ci,UV[:,k],n) for k in range(2)],1)/cnt
NF=ci[Fi]; ok=(NF[:,0]!=NF[:,1])&(NF[:,1]!=NF[:,2])&(NF[:,0]!=NF[:,2]); NF=np.unique(NF[ok],axis=0)
used=np.unique(NF); remap=-np.ones(n,np.int64); remap[used]=np.arange(len(used))
pu,pi=np.unique(pk,return_inverse=True)
fn=np.cross(P[Fi[:,1]]-P[Fi[:,0]],P[Fi[:,2]]-P[Fi[:,0]]); acc=np.zeros((len(pu),3))
for k in range(3): np.add.at(acc,pi[Fi[:,k]],fn)
first=np.zeros(n,np.int64); first[ci]=pi
N=acc[first]; N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-12
NP,NUV,N,NF=NP[used],NUV[used],N[used],remap[NF]
print(len(NP),len(NF))
mn=NP.min(0); mx=NP.max(0)
blob=struct.pack('<II6f',len(NP),len(NF),*mn,*mx)+np.round((NP-mn)/(mx-mn)*65535).astype(np.uint16).tobytes()+np.round(np.clip(NUV,0,1)*65535).astype(np.uint16).tobytes()+np.round(N*127).astype(np.int8).tobytes()
blob+=b'\0'*((-len(blob))%4)+NF.astype(np.uint32).tobytes()
print(len(blob)/1e6,'MB')
open('/home/claude/ramayana/src/assets/ramaMesh.ts','w').write("// Generated from the Rodin (Hyper3D) Rama model by scripts/prep-rama.py. Do not edit.\nexport default '"+base64.b64encode(blob).decode()+"';\n")
