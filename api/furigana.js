import kuroshiroPkg from "kuroshiro";
import kuromojiPkg from "kuroshiro-analyzer-kuromoji";
import path from "path";

// Vercel(Node.js)ではCommonJSの読み込み方がブラウザと異なるため、中身を取り出す
const Kuroshiro = kuroshiroPkg.default || kuroshiroPkg;
const KuromojiAnalyzer = kuromojiPkg.default || kuromojiPkg;

let kuroshiroInstance = null;
let initPromise = null;

async function initKuroshiro() {
    if (kuroshiroInstance) return kuroshiroInstance;
    
    if (!initPromise) {
        initPromise = (async () => {
            const kuroshiro = new Kuroshiro();
            const dictPath = path.join(process.cwd(), "node_modules", "kuromoji", "dict");
            await kuroshiro.init(new KuromojiAnalyzer({ dictPath }));
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
