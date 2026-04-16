import { useState, useCallback } from 'react';
import { extractTextFromPptx, addFuriganaAndDownload, generateAndDownloadHtmlFurigana } from './utils/pptx_parser';

function App() {
  const [slidesText, setSlidesText] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const [currentFile, setCurrentFile] = useState(null);
  
  // Phase 2 state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');

  const processFile = async (file) => {
    if (!file || !file.name.endsWith('.pptx')) {
      setError('有効な .pptx ファイルを選択してください。');
      return;
    }

    setFileName(file.name);
    setCurrentFile(file);
    setLoading(true);
    setError(null);
    setSlidesText([]);

    try {
      const extracted = await extractTextFromPptx(file);
      setSlidesText(extracted);
    } catch (err) {
      setError(`ファイルの解析中にエラーが発生しました: ${err.message || String(err)}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPptx = async () => {
    if (!currentFile) return;
    
    setIsGenerating(true);
    setError(null);
    try {
        await addFuriganaAndDownload(currentFile, (progressStatus) => {
            setGenerationProgress(progressStatus);
        });
    } catch (err) {
      setError(`エラーが発生しました: ${err.message || String(err)}`);
    } finally {
        setTimeout(() => {
            setIsGenerating(false);
            setGenerationProgress('');
        }, 3000);
    }
  };

  const handleDownloadHtml = async () => {
    if (!currentFile) return;
    
    setIsGenerating(true);
    setError(null);
    try {
        await generateAndDownloadHtmlFurigana(currentFile, (progressStatus) => {
            setGenerationProgress(progressStatus);
        });
    } catch (err) {
      setError(`HTMLの生成中にエラーが発生しました: ${err.message || String(err)}`);
    } finally {
        setTimeout(() => {
            setIsGenerating(false);
            setGenerationProgress('');
        }, 3000);
    }
  };

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Furigana Maker</h1>
        <p>PowerPoint(.pptx)ファイルからテキストをインポートします</p>
      </header>

      <main className="main-content">
        <div 
          className={`drop-zone ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('fileInput').click()}
        >
          <div className="drop-zone-content">
            <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p className="upload-text">
              ここをクリックしてファイルを選択するか、<br/>
              .pptx ファイルをドラッグ＆ドロップしてください
            </p>
            <input 
              type="file" 
              id="fileInput" 
              accept=".pptx" 
              onChange={handleFileInput} 
              className="hidden-input"
            />
          </div>
        </div>

        {loading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>ファイルを解析中...</p>
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {slidesText.length > 0 && !loading && (
          <div className="results-container">
            <div className="results-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', paddingBottom: '15px', borderBottom: '1px solid var(--card-border)', flexWrap: 'wrap', gap: '15px' }}>
                <h2 style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>{fileName} の解析結果</h2>
                
                <div className="action-buttons" style={{ display: 'flex', gap: '10px' }}>
                    {isGenerating ? (
                        <div className="generation-status" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent-color)' }}>
                            <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px', marginBottom: 0 }}></div>
                            <span>{generationProgress}</span>
                        </div>
                    ) : (
                        <>
                            <button 
                                onClick={handleDownloadPptx}
                                className="download-btn"
                                style={{
                                    background: 'rgba(59, 130, 246, 0.1)',
                                    color: 'var(--accent-color)',
                                    border: '1px solid var(--accent-color)',
                                    padding: '10px 20px',
                                    borderRadius: '30px',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s',
                                }}
                                onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
                                onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
                            >
                                PPTX保存 (括弧表記)
                            </button>
                            <button 
                                onClick={handleDownloadHtml}
                                className="download-btn"
                                style={{
                                    background: 'linear-gradient(135deg, var(--accent-color) 0%, #a78bfa 100%)',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '30px',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s',
                                    boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)'
                                }}
                                onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
                                onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
                            >
                                HTML保存 (PDF印刷用レイアウト)
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="slides-grid">
              {slidesText.map((slide) => (
                <div key={slide.slideNumber} className="slide-card">
                  <div className="slide-header">SLIDE {slide.slideNumber}</div>
                  <div className="slide-content">
                    {slide.text ? slide.text : <span className="empty-text">テキストなし</span>}
                  </div>
                </div>
              ))}
            </div>
            
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
