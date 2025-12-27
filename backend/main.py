import sqlite3
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from core.engine import AddressEngine
from pydantic import BaseModel
import os

app = FastAPI(title="Locates.me API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Engine
KEY = b'0123456789abcdef'
TWEAK = b'tweak'
engine = AddressEngine(KEY, TWEAK)

# Initialize Database
DB_PATH = "locates.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS aliases
                 (alias TEXT PRIMARY KEY, lat REAL, lon REAL)''')
    conn.commit()
    conn.close()

init_db()

class EncodeResponse(BaseModel):
    words: str
    lat: float
    lon: float
    language: str

class ResolveResponse(BaseModel):
    lat: float
    lon: float
    words: str
    language: str

class ClaimRequest(BaseModel):
    alias: str
    lat: float
    lon: float

@app.post("/claim")
async def claim_address(req: ClaimRequest):
    # Validate alias
    if len(req.alias) < 3:
        raise HTTPException(status_code=400, detail="Alias too short")
    
    # Validate coordinates
    if not (-90 <= req.lat <= 90) or not (-180 <= req.lon <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates")
    
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("INSERT INTO aliases (alias, lat, lon) VALUES (?, ?, ?)", 
                      (req.alias, req.lat, req.lon))
            conn.commit()
        return {"status": "success", "message": f"Address '{req.alias}' claimed!"}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Alias already taken")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/aliases")
async def get_aliases():
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("SELECT alias, lat, lon FROM aliases")
            rows = c.fetchall()
        return [{"alias": r[0], "lat": r[1], "lon": r[2]} for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/encode", response_model=EncodeResponse)
async def encode(lat: float, lon: float, lang: str = 'en'):
    # Validate coordinates
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="Invalid coordinates")
    
    try:
        words = engine.geo_to_words(lat, lon, lang)
        return EncodeResponse(words=words, lat=lat, lon=lon, language=lang)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/resolve", response_model=ResolveResponse)
async def resolve(address: str, lang: str = 'en'):
    # 1. Check DB for custom alias
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("SELECT lat, lon FROM aliases WHERE alias = ?", (address,))
            result = c.fetchone()
            if result:
                return ResolveResponse(lat=result[0], lon=result[1], words=address, language=lang)
    except Exception as e:
        print(f"DB Error: {e}")

    # 2. Fallback to Algorithmic Resolution
    try:
        lat, lon = engine.words_to_geo(address, lang)
        return ResolveResponse(lat=lat, lon=lon, words=address, language=lang)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid address: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
