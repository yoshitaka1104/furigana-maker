import JSZip from 'jszip';
import KuroshiroWorker from './kuroshiro.worker.js?worker';

let workerInstance = null;
let messageId = 0;
const resolvers = {};

function getWorker() {
    if (!workerInstance) {
        workerInstance = new KuroshiroWorker();
        workerInstance.onmessage = (e) => {
            const { id, type, result, error } = e.data;
            if (resolvers[id]) {
                if (type.endsWith('_ERROR')) {
                    resolvers[id].reject(new Error(error));
                } else {
                    resolvers[id].resolve(result);
                }
                delete resolvers[id];
            }
        };
    }
    return workerInstance;
}

function runInWorker(type, payload) {
    return new Promise((resolve, reject) => {
        const id = ++messageId;
        resolvers[id] = { resolve, reject };
        getWorker().postMessage({ id, type, payload });
    });
}

/**
 * Initialize Kuroshiro parsing engine via Web Worker
 */
export async function initKuroshiro() {
    await runInWorker('INIT');
}

/**
 * Convert text using Kuroshiro Web Worker
 */
export async function convertText(text, options) {
    if (!text || text.trim().length === 0) return text;
    return await runInWorker('CONVERT', { text, options });
}

/**
 * Extracts text from a PPTX file.
 * @param {File} file - The PPTX file object.
 * @returns {Promise<Array<{slideNumber: number, text: string}>>}
 */
export async function extractTextFromPptx(file) {
    const zip = new JSZip();
    const slidesData = [];

    try {
        const loadedZip = await zip.loadAsync(file);
        
        const slideFiles = [];
        loadedZip.folder("ppt/slides").forEach((relativePath, fileObj) => {
            if (relativePath.match(/^slide\d+\.xml$/)) {
                slideFiles.push(fileObj);
            }
        });

        slideFiles.sort((a, b) => {
            const numA = parseInt(a.name.match(/slide(\d+)\.xml/)[1], 10);
            const numB = parseInt(b.name.match(/slide(\d+)\.xml/)[1], 10);
            return numA - numB;
        });

        const parser = new DOMParser();

        for (let i = 0; i < slideFiles.length; i++) {
            const slideFile = slideFiles[i];
            const xmlText = await slideFile.async("text");
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            
            const pNodes = xmlDoc.getElementsByTagName("a:p");
            let slideText = "";
            
            for (let j = 0; j < pNodes.length; j++) {
                const currentP = pNodes[j];
                let pText = "";
                const descendants = currentP.getElementsByTagName("*");
                for (let k = 0; k < descendants.length; k++) {
                    const el = descendants[k];
                    if (el.nodeName === "a:t") {
                        pText += el.textContent;
                    } else if (el.nodeName === "a:br") {
                        pText += "\n";
                    }
                }
                if (pText.trim().length > 0) {
                    slideText += pText + "\n\n";
                }
            }
            
            slidesData.push({
                slideNumber: parseInt(slideFile.name.match(/slide(\d+)\.xml/)[1], 10),
                text: slideText.trim()
            });
        }

        return slidesData;
    } catch (error) {
        console.error("Error parsing PPTX", error);
        throw error;
    }
}

/**
 * Adds furigana (okurigana format) to all text inside PPTX and triggers download.
 * @param {File} file - Original PPTX file
 * @param {Function} progressCallback - callback(progressString) for UI updates
 */
export async function addFuriganaAndDownload(file, progressCallback) {
    progressCallback("辞書データ(17MB)を展開中...");
    await initKuroshiro();
    
    progressCallback("PPTXファイルを展開しています...");
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(file);
    
    // Find all slide XML files
    const slideFiles = [];
    loadedZip.folder("ppt/slides").forEach((relativePath, fileObj) => {
        if (relativePath.match(/^slide\d+\.xml$/)) {
            slideFiles.push(fileObj);
        }
    });

    const parser = new DOMParser();
    const serializer = new XMLSerializer();

    for (let i = 0; i < slideFiles.length; i++) {
        progressCallback(`スライドを処理中... (${i + 1}/${slideFiles.length})`);
        // UI描画のための待機
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const slideFile = slideFiles[i];
        const xmlText = await slideFile.async("text");
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        // Extract text from <a:t> tags
        const textNodes = xmlDoc.getElementsByTagName("a:t");
        
        for (let j = 0; j < textNodes.length; j++) {
            const originalText = textNodes[j].textContent;
            if (originalText && originalText.trim().length > 0) {
                try {
                    // mode: "okurigana" generates 漢字(かんじ) format
                    const convertedText = await convertText(originalText, { 
                        to: "hiragana", 
                        mode: "okurigana" 
                    });
                    textNodes[j].textContent = convertedText;
                } catch (e) {
                    console.warn("Kuroshiro conversion error for: " + originalText, e);
                }
            }
        }
        
        const modifiedXml = serializer.serializeToString(xmlDoc);
        loadedZip.file(slideFile.name, modifiedXml); // overwrite in zip
    }

    progressCallback("新しいPPTXファイルを生成しています...");
    const blob = await loadedZip.generateAsync({ type: "blob" });
    
    progressCallback("ダウンロードを開始します...");
    
    // Trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    // Inject _furigana to original filename
    const newName = file.name.replace(/\.pptx$/i, "_furigana.pptx");
    link.download = newName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    progressCallback("完了しました！");
}

/**
 * Generates an HTML file with ruby tags for furigana and triggers download.
 * @param {File} file - Original PPTX file
 * @param {Function} progressCallback - callback(progressString) for UI updates
 */
export async function generateAndDownloadHtmlFurigana(file, progressCallback) {
    progressCallback("辞書データ(17MB)を展開中...");
    await initKuroshiro();
    
    progressCallback("PPTXファイルを展開しています...");
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(file);
    
    const slideFiles = [];
    loadedZip.folder("ppt/slides").forEach((relativePath, fileObj) => {
        if (relativePath.match(/^slide\d+\.xml$/)) {
            slideFiles.push(fileObj);
        }
    });
    
    slideFiles.sort((a, b) => {
        const numA = parseInt(a.name.match(/slide(\d+)\.xml/)[1], 10);
        const numB = parseInt(b.name.match(/slide(\d+)\.xml/)[1], 10);
        return numA - numB;
    });

    const parser = new DOMParser();
    const slideHtmlContents = [];

    for (let i = 0; i < slideFiles.length; i++) {
        progressCallback(`スライドを処理中... (${i + 1}/${slideFiles.length})`);
        await new Promise(resolve => setTimeout(resolve, 10)); // Yield
        
        const slideFile = slideFiles[i];
        const xmlText = await slideFile.async("text");
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        const pNodes = xmlDoc.getElementsByTagName("a:p");
        let slideTextContent = "";
        
        for (let j = 0; j < pNodes.length; j++) {
            const currentP = pNodes[j];
            let pText = "";
            const descendants = currentP.getElementsByTagName("*");
            for (let k = 0; k < descendants.length; k++) {
                const el = descendants[k];
                if (el.nodeName === "a:t") {
                    const originalText = el.textContent;
                    if (originalText && originalText.trim().length > 0) {
                        try {
                            const convertedText = await convertText(originalText, { 
                                to: "hiragana", 
                                mode: "furigana" 
                            });
                            pText += convertedText;
                        } catch (e) {
                            console.warn("Kuroshiro conversion error for: " + originalText, e);
                            pText += originalText;
                        }
                    } else {
                        pText += originalText;
                    }
                } else if (el.nodeName === "a:br") {
                    pText += "<br/>";
                }
            }
            
            if (pText.trim().length > 0) {
                slideTextContent += `<p>${pText}</p>`;
            }
        }
        
        slideHtmlContents.push(`
            <div class="slide">
                <div class="slide-number">Slide ${i + 1}</div>
                <div class="slide-text">${slideTextContent}</div>
            </div>
        `);
    }

    progressCallback("HTMLを生成しています...");
    
    const htmlTemplate = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>${file.name} - ふりがな付きテキスト</title>
    <style>
        body {
            font-family: 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif;
            background-color: #f3f4f6;
            color: #1f2937;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        }
        .slide {
            background: white;
            padding: 30px;
            margin-bottom: 25px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            page-break-inside: avoid;
        }
        .slide-number {
            font-size: 0.9rem;
            color: #6b7280;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 10px;
            margin-bottom: 15px;
            font-weight: bold;
        }
        .slide-text {
            font-size: 1.4rem;
            line-height: 2.2;
            white-space: pre-wrap;
        }
        ruby {
            ruby-align: center;
        }
        rt {
            font-size: 0.6em;
            color: #4b5563;
        }
        @media print {
            body {
                background-color: white;
            }
            .header {
                box-shadow: none;
                border: 1px solid #e5e7eb;
            }
            .slide {
                box-shadow: none;
                border: 1px solid #e5e7eb;
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>${file.name} - ふりがな抽出結果</h2>
            <p>※印刷メニュー（Ctrl+P / Cmd+P）からPDFとして保存できます。</p>
        </div>
        ${slideHtmlContents.join('')}
    </div>
</body>
</html>`;

    const blob = new Blob([htmlTemplate], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    progressCallback("ダウンロードを開始します...");
    const link = document.createElement("a");
    link.href = url;
    
    // Inject _furigana to original filename but change to .html
    const newName = file.name.replace(/\.pptx$/i, "_furigana.html");
    link.download = newName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    progressCallback("完了しました！");
}
