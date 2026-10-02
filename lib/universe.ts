/**
 * Default scan universe: liquid IDX names across sectors.
 *
 * Every ticker here has been verified against the free Yahoo endpoint (which is
 * where prices and reports come from) to satisfy two hard requirements:
 *
 *   1. at least 200 daily bars of history (the technical engine needs a year+),
 *   2. median daily turnover of Rp 250 million or more.
 *
 * The turnover floor matters more than the count. A screener is only useful on
 * names you could actually trade, and on a thin name the technical score is
 * mostly noise: one anomalous candle can flip the tier. Names below the floor
 * are still reachable one at a time through search and the stock detail page,
 * they just do not earn a row on the screener.
 *
 * A handful of IDX listings cannot be covered at all - the free endpoint simply
 * has no series for them (PROT, SQMR and BNIL are examples). Coverage of every
 * Indonesian issuer is therefore not achievable with this source.
 */

export interface Stock {
  symbol: string;
  name: string;
  sector: string;
}

export const UNIVERSE: Stock[] = [
  // --- Perbankan ---
  { symbol: "BBCA", name: "Bank Central Asia", sector: "Perbankan" },
  { symbol: "BBRI", name: "Bank Rakyat Indonesia", sector: "Perbankan" },
  { symbol: "BMRI", name: "Bank Mandiri", sector: "Perbankan" },
  { symbol: "BBNI", name: "Bank Negara Indonesia", sector: "Perbankan" },
  { symbol: "BBTN", name: "Bank Tabungan Negara", sector: "Perbankan" },
  { symbol: "BNGA", name: "Bank CIMB Niaga", sector: "Perbankan" },
  { symbol: "NISP", name: "Bank OCBC NISP", sector: "Perbankan" },
  { symbol: "BJBR", name: "Bank BJB", sector: "Perbankan" },
  { symbol: "AGRO", name: "Bank Raya Indonesia", sector: "Perbankan" },
  { symbol: "ARTO", name: "Bank Jago", sector: "Perbankan" },
  { symbol: "BANK", name: "Bank Aladin Syariah", sector: "Perbankan" },
  { symbol: "BTPS", name: "Bank BTPN Syariah", sector: "Perbankan" },
  { symbol: "BEKS", name: "Bank Pembangunan Daerah Banten", sector: "Perbankan" },
  { symbol: "BACA", name: "Bank Capital Asia", sector: "Perbankan" },

  // --- Energi & Tambang ---
  { symbol: "ANTM", name: "Aneka Tambang", sector: "Energi & Tambang" },
  { symbol: "ADRO", name: "Alamtri Resources Indonesia", sector: "Energi & Tambang" },
  { symbol: "PTBA", name: "Bukit Asam", sector: "Energi & Tambang" },
  { symbol: "INCO", name: "Vale Indonesia", sector: "Energi & Tambang" },
  { symbol: "TINS", name: "Timah", sector: "Energi & Tambang" },
  { symbol: "PGAS", name: "Perusahaan Gas Negara", sector: "Energi & Tambang" },
  { symbol: "MEDC", name: "Medco Energi Internasional", sector: "Energi & Tambang" },
  { symbol: "AKRA", name: "AKR Corporindo", sector: "Energi & Tambang" },
  { symbol: "ITMG", name: "Indo Tambangraya Megah", sector: "Energi & Tambang" },
  { symbol: "HRUM", name: "Harum Energy", sector: "Energi & Tambang" },
  { symbol: "BRPT", name: "Barito Pacific", sector: "Energi & Tambang" },
  { symbol: "BREN", name: "Barito Renewables Energy", sector: "Energi & Tambang" },
  { symbol: "TPIA", name: "Chandra Asri Pacific", sector: "Energi & Tambang" },
  { symbol: "ESSA", name: "Surya Esa Perkasa", sector: "Energi & Tambang" },
  { symbol: "RAJA", name: "Rukun Raharja", sector: "Energi & Tambang" },
  { symbol: "DOID", name: "Buma Internasional Grup", sector: "Energi & Tambang" },
  { symbol: "BUMI", name: "Bumi Resources", sector: "Energi & Tambang" },
  { symbol: "BRMS", name: "Bumi Resources Minerals", sector: "Energi & Tambang" },
  { symbol: "CUAN", name: "Petrindo Jaya Kreasi", sector: "Energi & Tambang" },
  { symbol: "AMMN", name: "Amman Mineral Internasional", sector: "Energi & Tambang" },
  { symbol: "MDKA", name: "Merdeka Copper Gold", sector: "Energi & Tambang" },
  { symbol: "EMAS", name: "Merdeka Gold Resources", sector: "Energi & Tambang" },
  { symbol: "DEWA", name: "Darma Henwa", sector: "Energi & Tambang" },
  { symbol: "RATU", name: "Raharja Energi Cepu", sector: "Energi & Tambang" },
  { symbol: "PSAB", name: "J Resources Asia Pasifik", sector: "Energi & Tambang" },
  { symbol: "ENRG", name: "Energi Mega Persada", sector: "Energi & Tambang" },
  { symbol: "BSSR", name: "Baramulti Suksessarana", sector: "Energi & Tambang" },
  { symbol: "AGII", name: "Samator Indo Gas", sector: "Energi & Tambang" },
  { symbol: "BTEK", name: "Bumi Teknokultura Unggul", sector: "Energi & Tambang" },
  { symbol: "GEMS", name: "Golden Energy Mines", sector: "Energi & Tambang" },
  { symbol: "KRYA", name: "Bangun Karya Perkasa Jaya", sector: "Energi & Tambang" },

  // --- Industri ---
  { symbol: "ASII", name: "Astra International", sector: "Industri" },
  { symbol: "UNTR", name: "United Tractors", sector: "Industri" },
  { symbol: "INTP", name: "Indocement Tunggal Prakarsa", sector: "Industri" },
  { symbol: "SMGR", name: "Semen Indonesia", sector: "Industri" },
  { symbol: "TKIM", name: "Pabrik Kertas Tjiwi Kimia", sector: "Industri" },
  { symbol: "SSIA", name: "Surya Semesta Internusa", sector: "Industri" },
  { symbol: "AUTO", name: "Astra Otoparts", sector: "Industri" },
  { symbol: "APEX", name: "Apexindo Pratama Duta", sector: "Industri" },
  { symbol: "WTON", name: "Wijaya Karya Beton", sector: "Industri" },
  { symbol: "INDS", name: "Indospring", sector: "Industri" },
  { symbol: "GRPH", name: "Griptha Putra Persada", sector: "Industri" },
  { symbol: "MDIY", name: "Daya Intiguna Yasa", sector: "Industri" },
  { symbol: "UNIQ", name: "Ulima Nitra", sector: "Industri" },
  { symbol: "SMSM", name: "Selamat Sempurna", sector: "Industri" },
  { symbol: "BOAT", name: "Newport Marine Services", sector: "Industri" },

  // --- Konsumen ---
  { symbol: "UNVR", name: "Unilever Indonesia", sector: "Konsumen" },
  { symbol: "INDF", name: "Indofood Sukses Makmur", sector: "Konsumen" },
  { symbol: "ICBP", name: "Indofood CBP Sukses Makmur", sector: "Konsumen" },
  { symbol: "KLBF", name: "Kalbe Farma", sector: "Konsumen" },
  { symbol: "SIDO", name: "Sidomuncul Kemas", sector: "Konsumen" },
  { symbol: "MYOR", name: "Mayora Indah", sector: "Konsumen" },
  { symbol: "ERAA", name: "Erajaya Swasembada", sector: "Konsumen" },
  { symbol: "ROTI", name: "Nippon Indosari Corpindo", sector: "Konsumen" },
  { symbol: "ACES", name: "Aspirasi Hidup Indonesia", sector: "Konsumen" },
  { symbol: "AMRT", name: "Sumber Alfaria Trijaya", sector: "Konsumen" },
  { symbol: "MAPI", name: "Mitra Adiperkasa", sector: "Konsumen" },
  { symbol: "MAPA", name: "Map Aktif Adiperkasa", sector: "Konsumen" },
  { symbol: "BUKA", name: "Bukalapak.com", sector: "Konsumen" },
  { symbol: "FAST", name: "Fast Food Indonesia", sector: "Konsumen" },
  { symbol: "LPPF", name: "MDS Retailing", sector: "Konsumen" },
  { symbol: "KIOS", name: "Kioson Komersial Indonesia", sector: "Konsumen" },
  { symbol: "COCO", name: "Wahana Interfood Nusantara", sector: "Konsumen" },
  { symbol: "AVIA", name: "Avia Avian", sector: "Konsumen" },
  { symbol: "IMAS", name: "Indomobil Sukses Internasional", sector: "Konsumen" },
  { symbol: "UCID", name: "Uni-Charm Indonesia", sector: "Konsumen" },
  { symbol: "FILM", name: "MD Entertainment", sector: "Konsumen" },
  { symbol: "MNCN", name: "Media Nusantara Citra", sector: "Konsumen" },
  { symbol: "SNLK", name: "Sunter Lakeside Hotel", sector: "Konsumen" },
  { symbol: "SINI", name: "Singaraja Putra", sector: "Konsumen" },
  { symbol: "PSKT", name: "Red Planet Indonesia", sector: "Konsumen" },
  { symbol: "MLBI", name: "Multi Bintang Indonesia", sector: "Konsumen" },
  { symbol: "SOFA", name: "Solusi Environment Asia", sector: "Konsumen" },
  { symbol: "SPTO", name: "Surya Pertiwi", sector: "Konsumen" },
  { symbol: "FORU", name: "Fortune Indonesia", sector: "Konsumen" },
  { symbol: "AYAM", name: "Janu Putra Sejahtera", sector: "Konsumen" },

  // --- Properti ---
  { symbol: "BSDE", name: "Bumi Serpong Damai", sector: "Properti" },
  { symbol: "CTRA", name: "Ciputra Development", sector: "Properti" },
  { symbol: "PWON", name: "Pakuwon Jati", sector: "Properti" },
  { symbol: "APLN", name: "Agung Podomoro Land", sector: "Properti" },
  { symbol: "DMAS", name: "Puradelta Lestari", sector: "Properti" },
  { symbol: "LPKR", name: "Lippo Karawaci", sector: "Properti" },
  { symbol: "SMRA", name: "Summarecon Agung", sector: "Properti" },
  { symbol: "KOTA", name: "DMS Propertindo", sector: "Properti" },
  { symbol: "BLUE", name: "Berkah Prima Perkasa", sector: "Properti" },
  { symbol: "BUVA", name: "Bukit Uluwatu Villa", sector: "Properti" },
  { symbol: "PANI", name: "Pantai Indah Kapuk Dua", sector: "Properti" },
  { symbol: "FUTR", name: "Futura Energi Global", sector: "Properti" },
  { symbol: "SATU", name: "Kota Satu Properti", sector: "Properti" },
  { symbol: "ZATA", name: "Bersama Zatta Jaya", sector: "Properti" },
  { symbol: "RODA", name: "Pikko Land Development", sector: "Properti" },
  { symbol: "BIPP", name: "Bhuwanatala Indah Permai", sector: "Properti" },

  // --- Infrastruktur ---
  { symbol: "JSMR", name: "Jasa Marga", sector: "Infrastruktur" },
  { symbol: "TOWR", name: "Sarana Menara Nusantara", sector: "Infrastruktur" },
  { symbol: "TBIG", name: "Tower Bersama Infrastructure", sector: "Infrastruktur" },
  { symbol: "GIAA", name: "Garuda Indonesia", sector: "Infrastruktur" },
  { symbol: "PTPP", name: "PP Pembangunan dan Perubahan", sector: "Infrastruktur" },
  { symbol: "DSSA", name: "Dian Swastatika Sentosa", sector: "Infrastruktur" },
  { symbol: "BULL", name: "Buana Lintas Lautan", sector: "Infrastruktur" },
  { symbol: "JAST", name: "Jasnita Telekomindo", sector: "Infrastruktur" },
  { symbol: "JKON", name: "Jaya Konstruksi", sector: "Infrastruktur" },
  { symbol: "ASPI", name: "Andalan Sakti Primaindo", sector: "Infrastruktur" },

  // --- Telekomunikasi ---
  { symbol: "TLKM", name: "Telkom Indonesia", sector: "Telekomunikasi" },
  { symbol: "EXCL", name: "XL Smart Telecom Sejahtera", sector: "Telekomunikasi" },
  { symbol: "ISAT", name: "Indosat Ooredoo Hutchison", sector: "Telekomunikasi" },
  { symbol: "MTEL", name: "Dayamitra Telekomunikasi", sector: "Telekomunikasi" },

  // --- Teknologi ---
  { symbol: "GOTO", name: "GoTo Gojek Tokopedia", sector: "Teknologi" },
  { symbol: "WIFI", name: "Solusi Sinergi Digital", sector: "Teknologi" },
  { symbol: "MORA", name: "Mora Telematika Indonesia", sector: "Teknologi" },
  { symbol: "TMPO", name: "Tempo Inti Media", sector: "Teknologi" },

  // --- Kesehatan ---
  { symbol: "SILO", name: "Siloam International Hospitals", sector: "Kesehatan" },
  { symbol: "MIKA", name: "Mitra Keluarga Karyasehat", sector: "Kesehatan" },
  { symbol: "HEAL", name: "Medikaloka Hermina", sector: "Kesehatan" },
  { symbol: "CARE", name: "Metro Healthcare Indonesia", sector: "Kesehatan" },
  { symbol: "VICI", name: "Victoria Care Indonesia", sector: "Kesehatan" },
  { symbol: "NANO", name: "Nanotech Indonesia Global", sector: "Kesehatan" },

  // --- Agrikultur ---
  { symbol: "CPRO", name: "Central Proteina Prima", sector: "Agrikultur" },
  { symbol: "AALI", name: "Astra Agro Lestari", sector: "Agrikultur" },
  { symbol: "BEEF", name: "Estika Tata Tiara", sector: "Agrikultur" },
  { symbol: "GULA", name: "Aman Agrindo", sector: "Agrikultur" },
  { symbol: "WOOD", name: "Integra Indocabinet", sector: "Agrikultur" },

  // --- Keuangan ---
  { symbol: "BFIN", name: "BFI Finance Indonesia", sector: "Keuangan" },
  { symbol: "MARK", name: "Mark Dynamics Indonesia", sector: "Keuangan" },
  { symbol: "TUGU", name: "Asuransi Tugu Pratama Indonesia", sector: "Keuangan" },
  { symbol: "BCAP", name: "MNC Kapital Indonesia", sector: "Keuangan" },
  { symbol: "KREN", name: "Quantum Clovera Investama", sector: "Keuangan" },
  { symbol: "PEGE", name: "Panca Global Kapital", sector: "Keuangan" },
  { symbol: "PADI", name: "Minna Padi Investama Sekuritas", sector: "Keuangan" },
  { symbol: "NPGF", name: "Nusa Palapa Gemilang", sector: "Keuangan" },
  { symbol: "CASA", name: "Capital Financial Indonesia", sector: "Keuangan" },
];

/** Fast symbol -> metadata lookup. */
const UNIVERSE_MAP = new Map(UNIVERSE.map((s) => [s.symbol, s]));

export function getStockMeta(symbol: string): Stock | null {
  return UNIVERSE_MAP.get(symbol.toUpperCase()) ?? null;
}

/** Case-insensitive substring search across the universe. */
export function searchUniverse(query: string, limit = 8): Stock[] {
  const upper = query.trim().toUpperCase();
  if (!upper) return [];

  const matches: Stock[] = [];
  for (const stock of UNIVERSE) {
    if (
      stock.symbol.includes(upper) ||
      stock.name.toUpperCase().includes(upper) ||
      stock.sector.toUpperCase().includes(upper)
    ) {
      matches.push(stock);
    }
    if (matches.length >= limit) break;
  }
  return matches;
}

export function sectorOf(symbol: string): string {
  return getStockMeta(symbol)?.sector ?? "Lainnya";
}

export function displayName(symbol: string): string {
  return getStockMeta(symbol)?.name ?? symbol;
}

/** Every distinct sector present in the universe. */
export function allSectors(): string[] {
  return [...new Set(UNIVERSE.map((s) => s.sector))].sort((a, b) => a.localeCompare(b, "id"));
}
