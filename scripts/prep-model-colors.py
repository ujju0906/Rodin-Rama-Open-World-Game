# Prepares a Rodin (Hyper3D) OBJ whose texture is split into very small islands:
# the diffuse texture is baked into vertex colours, then the mesh is reduced by spatial clustering.
# Usage: python3 scripts/prep-model-colors.py <obj> <diffuse image> <out.ts> <cell size> [cut expression in x,y,z]
# The optional cut expression removes faces whose vertices all satisfy it (for example a weapon fused to a hand).
import numpy as np, base64, struct, sys
from PIL import Image
OBJ, TEX, OUT, CELL = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
V=[];VT=[];F=[]
with open(OBJ) as f:
    for l in f:
        if l[0]=='v':
            if l[1]==' ': V.append(l.split()[1:4])
            elif l[1]=='t': VT.append(l.split()[1:3])
        elif l[0]=='f':
            F.append([q.split('/')[:2] for q in l.split()[1:4]])
V=np.array(V,np.float32); VT=np.array(VT,np.float32); F=np.array(F,np.int64)-1
img=np.asarray(Image.open(TEX).convert('RGB'),np.float32)/255.0
H,W=img.shape[:2]
fv=F[:,:,0].reshape(-1); ft=F[:,:,1].reshape(-1)
uv=VT[ft]
px=np.clip((uv[:,0]*W).astype(int),0,W-1); py=np.clip(((1-uv[:,1])*H).astype(int),0,H-1)
col=img[py,px]**2.2   # to linear
P=V[fv]; y=P[:,1]
FACES=None
if len(sys.argv)>5:
    x,z=P[:,0],P[:,2]
    FACES=~eval(sys.argv[5]).reshape(-1,3).all(1)
cs=np.where(y>y.max()*0.8,CELL*0.5,CELL)
c=np.floor(P/cs[:,None]).astype(np.int64)
pk=((c[:,0]+2000)*4000+(c[:,1]+2000))*4000+(c[:,2]+2000)+(y>y.max()*0.8).astype(np.int64)*10**12
u,ci=np.unique(pk,return_inverse=True); n=len(u); cnt=np.bincount(ci,minlength=n)[:,None]
NP=np.stack([np.bincount(ci,P[:,k],n) for k in range(3)],1)/cnt
NC=np.stack([np.bincount(ci,col[:,k],n) for k in range(3)],1)/cnt
NF=ci.reshape(-1,3)
if FACES is not None: NF=NF[FACES]
ok=(NF[:,0]!=NF[:,1])&(NF[:,1]!=NF[:,2])&(NF[:,0]!=NF[:,2]); NF=np.unique(NF[ok],axis=0)
fn=np.cross(NP[NF[:,1]]-NP[NF[:,0]],NP[NF[:,2]]-NP[NF[:,0]]); N=np.zeros((n,3))
for k in range(3): np.add.at(N,NF[:,k],fn)
N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-12
print(n,len(NF))
mn=NP.min(0); mx=NP.max(0)
c4=np.concatenate([np.round(np.clip(NC,0,1)**(1/2.2)*255),np.full((n,1),255)],1).astype(np.uint8)  # stored as sRGB bytes
blob=struct.pack('<II6f',n,len(NF),*mn,*mx)+np.round((NP-mn)/(mx-mn)*65535).astype(np.uint16).tobytes()+c4.tobytes()+np.round(N*127).astype(np.int8).tobytes()
blob+=b'\0'*((-len(blob))%4)+NF.astype(np.uint32).tobytes()
print(len(blob)/1e6,'MB')
open(OUT,'w').write("// Generated from a Rodin (Hyper3D) model by scripts/prep-model-colors.py. Do not edit.\nexport default '"+base64.b64encode(blob).decode()+"';\n")
