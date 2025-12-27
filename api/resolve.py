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
            address = query.get('address', [''])[0]
            lang = query.get('lang', ['en'])[0]
            
            if not address:
                self.wfile.write(json.dumps({"error": "Address required"}).encode())
                return
            
            lat, lon = engine.words_to_geo(address, lang)
            response = {
                "lat": lat,
                "lon": lon,
                "words": address,
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
