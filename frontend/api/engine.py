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

    def geo_to_words(self, lat: float, lon: float, lang: str = 'en') -> str:
        # 1. Geo to H3 Index (Resolution 14)
        h3_index = h3.latlng_to_cell(lat, lon, 14)
        h3_index_int = int(h3_index, 16)  # Convert hex string to int

        # 2. Encrypt using FPE
        scrambled_int = self.fpe.encrypt(h3_index_int)

        # 3. Encode to words (base-N encoding)
        vocab = self.get_vocab(lang)
        words = []
        temp = scrambled_int
        while temp > 0:
            words.append(vocab[temp % self.base])
            temp //= self.base
        
        if not words:
            words = [vocab[0]]
        
        return ".".join(words[:4])  # Limit to 4 words for brevity

    def words_to_geo(self, word_address: str, lang: str = 'en') -> tuple:
        vocab = self.get_vocab(lang)
        words = word_address.split(".")
        
        # Decode from words to int
        scrambled_int = 0
        for i, word in enumerate(words):
            try:
                idx = vocab.index(word)
                scrambled_int += idx * (self.base ** i)
            except ValueError:
                raise ValueError(f"Word '{word}' not in vocabulary")
            
        # Decrypt
        h3_index_int = self.fpe.decrypt(scrambled_int)
        # Pad hex to 15 characters (standard H3 index length)
        h3_index_str = hex(h3_index_int)[2:].zfill(15)
        
        # H3 library expects hex string
        try:
            lat, lon = h3.cell_to_latlng(h3_index_str)
            return lat, lon
        except Exception as e:
            raise ValueError(f"Invalid H3 index: {h3_index_str}") from e
