from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs
from .engine import AddressEngine

# Initialize Engine
KEY = b'0123456789abcdef'
TWEAK = b'tweak'
engine = AddressEngine(KEY, TWEAK)

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        
        # Add CORS headers
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        try:
            lat = float(query.get('lat', [0])[0])
            lon = float(query.get('lon', [0])[0])
            lang = query.get('lang', ['en'])[0]
            
            # Validate coordinates
            if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                self.wfile.write(json.dumps({"error": "Invalid coordinates"}).encode())
                return
            
            words = engine.geo_to_words(lat, lon, lang)
            response = {
                "words": words,
                "lat": lat,
                "lon": lon,
                "language": lang
            }
            self.wfile.write(json.dumps(response).encode())
        except Exception as e:
            self.wfile.write(json.dumps({"error": str(e)}).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
