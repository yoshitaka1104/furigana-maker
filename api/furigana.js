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
    
    // 連続する漢字のフリガナを結合する後処理関数
    function mergeAdjacentKanjiFurigana(text, mode) {
        if (!text) return text;
        let prev = "";
        let current = text;
        
        if (mode === "okurigana" || !mode) {
            // 例: 自由(じゆう)貿易(ぼうえき) -> 自由貿易(じゆうぼうえき)
            const regex = /([\u4E00-\u9FFF\u3005]+)\(([\u3040-\u309F]+)\)([\u4E00-\u9FFF\u3005]+)\(([\u3040-\u309F]+)\)/g;
            while (prev !== current) {
                prev = current;
                current = current.replace(regex, "$1$3($2$4)");
            }
        } else if (mode === "furigana") {
            // 例: <ruby>自由...貿易... -> <ruby>自由貿易...
            const regex = /<ruby>([\u4E00-\u9FFF\u3005]+)<rp>\(<\/rp><rt>([\u3040-\u309F]+)<\/rt><rp>\)<\/rp><\/ruby><ruby>([\u4E00-\u9FFF\u3005]+)<rp>\(<\/rp><rt>([\u3040-\u309F]+)<\/rt><rp>\)<\/rp><\/ruby>/g;
            while (prev !== current) {
                prev = current;
                current = current.replace(regex, "<ruby>$1$3<rp>(</rp><rt>$2$4</rt><rp>)</rp></ruby>");
            }
        }
        return current;
    }

    // texts は変換したい文字列の配列
    // mode は "okurigana" か "furigana"
    const { texts, mode } = req.body;
    
    if (!texts || !Array.isArray(texts)) {
        return res.status(400).json({ error: 'Invalid input data' });
    }

    try {
        const kuro = await initKuroshiro();
        
        // すべてのテキストを一括で並列変換し、その後で連続漢字のフリガナ合体処理を実行
        const results = await Promise.all(texts.map(text => 
            kuro.convert(text, { to: "hiragana", mode: mode || "okurigana" })
                .then(converted => mergeAdjacentKanjiFurigana(converted, mode || "okurigana"))
        ));
        
        return res.status(200).json({ results });
    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: error.message || String(error) });
    }
}
