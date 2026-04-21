import JSZip from 'jszip';

/**
 * Call Vercel Serverless API to convert text
 */
async function callFuriganaApi(texts, mode) {
    try {
        const response = await fetch('/api/furigana', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts, mode })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'API Error');
        }
        
        const data = await response.json();
        return data.results;
    } catch (err) {
        console.error("API Call error:", err);
        // エラーを握りつぶさずにフロントエンドのcatchブロックまで伝播させる
        throw err;
    }
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
    progressCallback("サーバーで処理の準備をしています...");
    
    // APIサーバーへウォームアップ用の空リクエストを投げる
    await fetch('/api/furigana', { method: 'POST', headers:{'Content-Type': 'application/json'}, body: JSON.stringify({texts: ["テスト"]}) }).catch(()=>null);
    
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
        
        const slideFile = slideFiles[i];
        const xmlText = await slideFile.async("text");
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        const textNodes = xmlDoc.getElementsByTagName("a:t");
        
        // 変換対象のテキストを抽出
        const textsToConvert = [];
        for (let j = 0; j < textNodes.length; j++) {
            const originalText = textNodes[j].textContent;
            if (originalText && originalText.trim().length > 0) {
                textsToConvert.push(originalText);
            }
        }
        
        // サーバーAPIで一括変換
        let convertedTexts = [];
        if (textsToConvert.length > 0) {
            convertedTexts = await callFuriganaApi(textsToConvert, "okurigana");
        }
        
        // 結果を元のXMLノードに適用
        let convertIdx = 0;
        const tNodesArray = Array.from(textNodes);
        
        for (let j = 0; j < tNodesArray.length; j++) {
            const tNode = tNodesArray[j];
            const originalText = tNode.textContent;
            if (originalText && originalText.trim().length > 0) {
                const convertedText = convertedTexts[convertIdx] || originalText;
                convertIdx++;
                
                const rNode = tNode.parentNode;
                // If it's not inside a run <a:r> for some reason, just replace text
                if (!rNode || rNode.nodeName !== "a:r") {
                    tNode.textContent = convertedText;
                    continue;
                }
                
                // "(ふりがな)" の部分をフォントサイズを2pt(200)小さくするために分割
                const chunks = convertedText.split(/(\([^)]+\))/g);
                
                for (const chunk of chunks) {
                    if (!chunk) continue;
                    
                    const newRNode = rNode.cloneNode(true);
                    const newTNode = newRNode.getElementsByTagName("a:t")[0];
                    if (newTNode) {
                        newTNode.textContent = chunk;
                    }
                    
                    // ふりがな（括弧で囲まれた部分）であればフォントサイズを小さくする
                    if (chunk.startsWith('(') && chunk.endsWith(')')) {
                        const rPrNode = newRNode.getElementsByTagName("a:rPr")[0];
                        if (rPrNode && rPrNode.hasAttribute("sz")) {
                            const originalSz = parseInt(rPrNode.getAttribute("sz"), 10);
                            if (!isNaN(originalSz)) {
                                // 8pt (800単位) 小さくする。最低フォントサイズを8pt(800)とする。
                                const newSz = Math.max(800, originalSz - 800);
                                rPrNode.setAttribute("sz", newSz.toString());
                            }
                        }
                    }
                    
                    rNode.parentNode.insertBefore(newRNode, rNode);
                }
                
                // 古いオリジナルの <a:r> ノードを削除
                rNode.parentNode.removeChild(rNode);
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
    progressCallback("サーバーで処理の準備をしています...");
    await fetch('/api/furigana', { method: 'POST', headers:{'Content-Type': 'application/json'}, body: JSON.stringify({texts: ["テスト"]}) }).catch(()=>null);
    
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
        
        const slideFile = slideFiles[i];
        const xmlText = await slideFile.async("text");
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        const pNodes = xmlDoc.getElementsByTagName("a:p");
        let slideTextContent = "";
        
        for (let j = 0; j < pNodes.length; j++) {
            const currentP = pNodes[j];
            let pText = "";
            const descendants = currentP.getElementsByTagName("*");
            
            // パラグラフ内のテキストを抽出
            const textsToConvert = [];
            for (let k = 0; k < descendants.length; k++) {
                const el = descendants[k];
                if (el.nodeName === "a:t") {
                    const originalText = el.textContent;
                    if (originalText && originalText.trim().length > 0) {
                        textsToConvert.push(originalText);
                    }
                }
            }
            
            // サーバーAPIで一括変換
            let convertedTexts = [];
            if (textsToConvert.length > 0) {
                convertedTexts = await callFuriganaApi(textsToConvert, "furigana");
            }
            
            // 結果を適用
            let convertIdx = 0;
            for (let k = 0; k < descendants.length; k++) {
                const el = descendants[k];
                if (el.nodeName === "a:t") {
                    const originalText = el.textContent;
                    if (originalText && originalText.trim().length > 0) {
                        pText += convertedTexts[convertIdx] || originalText;
                        convertIdx++;
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
