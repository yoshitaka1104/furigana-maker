import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";

let kuroshiroInstance = null;
let initPromise = null;

async function initKuroshiro() {
    if (kuroshiroInstance) return kuroshiroInstance;
    
    if (!initPromise) {
        initPromise = (async () => {
            const kuroshiro = new Kuroshiro();
            // VercelではNode.js環境でネイティブに動くため、辞書ファイルの特殊設定は不要です
            await kuroshiro.init(new KuromojiAnalyzer());
            return kuroshiro;
        })();
    }
    
    kuroshiroInstance = await initPromise;
    return kuroshiroInstance;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST requests only' });
    }
    
    // texts は変換したい文字列の配列
    // mode は "okurigana" か "furigana"
    const { texts, mode } = req.body;
    
    if (!texts || !Array.isArray(texts)) {
        return res.status(400).json({ error: 'Invalid input data' });
    }

    try {
        const kuro = await initKuroshiro();
        
        // すべてのテキストを一括で並列変換
        const results = await Promise.all(texts.map(text => 
            kuro.convert(text, { to: "hiragana", mode: mode || "okurigana" })
        ));
        
        return res.status(200).json({ results });
    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: error.message || String(error) });
    }
}
