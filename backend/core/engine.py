import h3
import pyffx

class AddressEngine:
    def __init__(self, secret_key: bytes, tweak: bytes):
        self.secret_key = secret_key
        self.tweak = tweak
        # H3 Resolution 14 produces 64-bit integers.
        # pyffx.Integer with length=20 covers the full 64-bit space.
        # Actually, H3 indices are hex strings usually, but can be int.
        # Max 64-bit int is 18,446,744,073,709,551,615 (20 digits).
        # Let's use a radix that covers the H3 index space.
        # H3 indices are 64-bit integers.
        # pyffx.Integer expects a length in digits (base 10 by default).
        # 2^64 is approx 1.84e19. So length=20 is safe.
        self.fpe = pyffx.Integer(self.secret_key, length=20)

        # Dummy vocabularies for demonstration
        self.vocab_en = ["Job", "Fish", "Happy", "Tree", "Apple", "Blue", "Car", "Dog", "Egg", "Goat"] * 300
        self.vocab_sw = ["Kazi", "Samaki", "Furaha", "Mti", "Tufaha", "Bluu", "Gari", "Mbwa", "Yai", "Mbuzi"] * 300
        self.vocab_ar = ["عمل", "سمكة", "سعيد", "شجرة", "تفاحة", "أزرق", "سيارة", "كلب", "بيض", "ماعز"] * 300
        self.vocab_fr = ["Travail", "Poisson", "Heureux", "Arbre", "Pomme", "Bleu", "Voiture", "Chien", "Oeuf", "Chevre"] * 300
        self.vocab_es = ["Trabajo", "Pez", "Feliz", "Arbol", "Manzana", "Azul", "Coche", "Perro", "Huevo", "Cabra"] * 300
        self.vocab_de = ["Arbeit", "Fisch", "Glucklich", "Baum", "Apfel", "Blau", "Auto", "Hund", "Ei", "Ziege"] * 300
        self.vocab_zh = ["工作", "鱼", "快乐", "树", "苹果", "蓝色", "汽车", "狗", "蛋", "山羊"] * 300
        
        # Ensure we have enough words
        self.vocab_en = [f"{w}{i}" for i, w in enumerate(self.vocab_en[:3000])]
        self.vocab_sw = [f"{w}{i}" for i, w in enumerate(self.vocab_sw[:3000])]
        self.vocab_ar = [f"{w}{i}" for i, w in enumerate(self.vocab_ar[:3000])]
        self.vocab_fr = [f"{w}{i}" for i, w in enumerate(self.vocab_fr[:3000])]
        self.vocab_es = [f"{w}{i}" for i, w in enumerate(self.vocab_es[:3000])]
        self.vocab_de = [f"{w}{i}" for i, w in enumerate(self.vocab_de[:3000])]
        self.vocab_zh = [f"{w}{i}" for i, w in enumerate(self.vocab_zh[:3000])]
        
        self.base = 3000

    def get_vocab(self, lang: str):
        if lang == 'ar': return self.vocab_ar
        if lang == 'sw': return self.vocab_sw
        if lang == 'fr': return self.vocab_fr
        if lang == 'es': return self.vocab_es
        if lang == 'de': return self.vocab_de
        if lang == 'zh': return self.vocab_zh
        return self.vocab_en

    def geo_to_words(self, lat: float, lon: float, language: str = 'en') -> str:
        # 1. Convert Lat/Long -> H3 Index (64-bit integer)
        # H3 v4 API: latlng_to_cell(lat, lng, res)
        h3_index_str = h3.latlng_to_cell(lat, lon, 14)
        h3_index_int = int(h3_index_str, 16)

        # 2. Scramble: Use FF1
        # We use the integer directly.
        scrambled_int = self.fpe.encrypt(h3_index_int)

        # 3. Encoding: Convert scrambled integer into 4-word string (Base-3000)
        
        vocab = self.get_vocab(language)
        
        res_words = []
        while scrambled_int > 0:
            rem = scrambled_int % self.base
            res_words.append(vocab[rem])
            scrambled_int //= self.base
        
        # If the number is 0 (rare but possible)
        if not res_words:
            res_words.append(vocab[0])

        # Let's reverse to get Big Endian order (Word1.Word2...)
        return ".".join(reversed(res_words))

    def words_to_geo(self, word_string: str, language: str = 'en') -> tuple:
        vocab = self.get_vocab(language)
        word_map = {w: i for i, w in enumerate(vocab)}
        
        words = word_string.split('.')
        
        scrambled_int = 0
        for w in words:
            val = word_map.get(w)
            if val is None:
                raise ValueError(f"Word '{w}' not found in vocabulary")
            scrambled_int = scrambled_int * self.base + val
            
        # Decrypt
        h3_index_int = self.fpe.decrypt(scrambled_int)
        # Pad hex to 15 characters (standard H3 index length)
        h3_index_str = hex(h3_index_int)[2:].zfill(15)
        
        # H3 library expects hex string
        try:
            lat, lon = h3.cell_to_latlng(h3_index_str)
            return lat, lon
        except Exception as e:
            # It might be that the hex string is missing leading zeros or something?
            # h3_index_int is 64 bit.
            # hex() might produce '0x...'
            # We stripped '0x'.
            return h3.cell_to_latlng(hex(h3_index_int))

