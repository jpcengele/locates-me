from engine import AddressEngine
import h3

def test_engine():
    key = b'secret-key-12345' # Must be suitable length for pyffx? 
    # pyffx might require specific key length or just bytes.
    # Let's use a 16-byte key just in case.
    key = b'0123456789abcdef'
    tweak = b'tweak'
    
    engine = AddressEngine(key, tweak)
    
    lat, lon = 37.7749, -122.4194 # San Francisco
    
    print(f"Original: {lat}, {lon}")
    
    # English
    words_en = engine.geo_to_words(lat, lon, 'en')
    print(f"Words (EN): {words_en}")
    
    lat_back, lon_back = engine.words_to_geo(words_en, 'en')
    print(f"Recovered (EN): {lat_back}, {lon_back}")
    
    # Verify H3 index match
    h3_orig = h3.latlng_to_cell(lat, lon, 14)
    h3_back = h3.latlng_to_cell(lat_back, lon_back, 14)
    assert h3_orig == h3_back, "H3 indices do not match!"
    print("English Roundtrip Successful!")
    
    # Swahili
    words_sw = engine.geo_to_words(lat, lon, 'sw')
    print(f"Words (SW): {words_sw}")
    
    assert words_en != words_sw, "Words should be different for different languages"
    
    lat_back_sw, lon_back_sw = engine.words_to_geo(words_sw, 'sw')
    print(f"Recovered (SW): {lat_back_sw}, {lon_back_sw}")
    
    h3_back_sw = h3.latlng_to_cell(lat_back_sw, lon_back_sw, 14)
    assert h3_orig == h3_back_sw, "H3 indices do not match for Swahili!"
    print("Swahili Roundtrip Successful!")

if __name__ == "__main__":
    test_engine()
