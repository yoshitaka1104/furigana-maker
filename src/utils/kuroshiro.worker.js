import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";

let kuroshiro = null;

self.onmessage = async (e) => {
    const { id, type, payload } = e.data;
    
    if (type === 'INIT') {
        try {
            if (!kuroshiro) {
                kuroshiro = new Kuroshiro();
                const cdnDictUrl = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/";
                await kuroshiro.init(new KuromojiAnalyzer({ dictPath: cdnDictUrl }));
            }
            self.postMessage({ id, type: 'INIT_SUCCESS' });
        } catch (err) {
            self.postMessage({ id, type: 'INIT_ERROR', error: err.message || String(err) });
        }
    } else if (type === 'CONVERT') {
        try {
            if (!kuroshiro) throw new Error("Kuroshiro is not initialized in worker");
            const result = await kuroshiro.convert(payload.text, payload.options);
            self.postMessage({ id, type: 'CONVERT_SUCCESS', result });
        } catch (err) {
            self.postMessage({ id, type: 'CONVERT_ERROR', error: err.message || String(err) });
        }
    }
};
