import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const API = 'http://localhost:4000'

export default function Admin() {
    const [section, setSection] = useState('pending')
    const [pending, setPending] = useState([])
    const [kb, setKb] = useState([])
    const [answerDraft, setAnswerDraft] = useState({})
    const [expandedId, setExpandedId] = useState(null)
    const [loading, setLoading] = useState(false)
    const [addForm, setAddForm] = useState({ question: '', answer: '' })
    const [addLoading, setAddLoading] = useState(false)
    const [editId, setEditId] = useState(null)
    const [editAnswer, setEditAnswer] = useState('')
    const [notification, setNotification] = useState(null)

    const notify = (msg, type = 'success') => {
        setNotification({ msg, type })
        setTimeout(() => setNotification(null), 3000)
    }

    const loadPending = useCallback(async () => {
        setLoading(true)
        try {
            const { data } = await axios.get(`${API}/api/pending`)
            setPending(data)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }, [])

    const loadKb = useCallback(async () => {
        setLoading(true)
        try {
            const { data } = await axios.get(`${API}/api/kb`)
            setKb(data)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }, [])

    useEffect(() => {
        if (section === 'pending') loadPending()
        if (section === 'kb') loadKb()
    }, [section, loadPending, loadKb])

    // ---- Pending Actions ----

    const answerPending = async (id) => {
        const answer = answerDraft[id]?.trim()
        if (!answer) return
        try {
            await axios.post(`${API}/api/pending/${id}/answer`, { answer })
            notify('✅ Answer saved to knowledge base!')
            setAnswerDraft(prev => { const n = { ...prev }; delete n[id]; return n })
            setExpandedId(null)
            loadPending()
        } catch (e) { notify('❌ Error saving answer', 'error') }
    }

    const dismissPending = async (id) => {
        await axios.post(`${API}/api/pending/${id}/dismiss`)
        notify('🗑 Question dismissed')
        loadPending()
    }

    // ---- KB Actions ----

    const addKBEntry = async () => {
        const { question, answer } = addForm
        if (!question.trim() || !answer.trim()) return
        setAddLoading(true)
        try {
            await axios.post(`${API}/api/kb`, { question, answer })
            notify('✅ Entry added to knowledge base!')
            setAddForm({ question: '', answer: '' })
            loadKb()
        } catch (e) { notify('❌ Error adding entry', 'error') }
        finally { setAddLoading(false) }
    }

    const deleteKBEntry = async (id) => {
        if (!confirm('Delete this entry from the knowledge base?')) return
        await axios.delete(`${API}/api/kb/${id}`)
        notify('🗑 Entry deleted')
        loadKb()
    }

    const saveEdit = async (id) => {
        await axios.put(`${API}/api/kb/${id}`, { answer: editAnswer })
        notify('✅ Entry updated')
        setEditId(null)
        loadKb()
    }

    return (
        <div className="admin-page page">
            {/* Sidebar */}
            <aside className="admin-sidebar">
                <button
                    className={`sidebar-item ${section === 'pending' ? 'active' : ''}`}
                    onClick={() => setSection('pending')}
                >
                    ⏳ Pending
                    {pending.length > 0 && <span className="badge">{pending.length}</span>}
                </button>
                <button
                    className={`sidebar-item ${section === 'kb' ? 'active' : ''}`}
                    onClick={() => setSection('kb')}
                >
                    📚 Knowledge Base
                </button>
            </aside>

            {/* Main Content */}
            <div className="admin-main">
                {/* Notification */}
                {notification && (
                    <div style={{
                        padding: '0.6rem 1rem',
                        borderRadius: '0.5rem',
                        marginBottom: '1rem',
                        background: notification.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                        border: `1px solid ${notification.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                        color: notification.type === 'error' ? '#ef4444' : '#10b981',
                        fontSize: '0.875rem'
                    }}>
                        {notification.msg}
                    </div>
                )}

                {/* ===== PENDING SECTION ===== */}
                {section === 'pending' && (
                    <>
                        <div className="admin-section-title">⏳ Unanswered Questions ({pending.length})</div>
                        {loading && <div className="empty-state"><span className="spinner" /> Loading...</div>}
                        {!loading && pending.length === 0 && (
                            <div className="empty-state">
                                <div className="empty-state-icon">🎉</div>
                                All questions have been answered!
                            </div>
                        )}
                        {pending.map(q => (
                            <div key={q.id} className="card">
                                <div className="card-question">{q.question}</div>
                                <div className="card-meta">
                                    <span className="tag tag-pending">Pending</span>
                                    {new Date(q.asked_at).toLocaleString()}
                                </div>

                                {expandedId === q.id ? (
                                    <div className="pending-answer-form">
                                        <textarea
                                            className="form-textarea"
                                            rows={3}
                                            placeholder="Type your answer..."
                                            value={answerDraft[q.id] || ''}
                                            onChange={e => setAnswerDraft(prev => ({ ...prev, [q.id]: e.target.value }))}
                                        />
                                        <div className="card-actions">
                                            <button className="btn btn-success" onClick={() => answerPending(q.id)}>
                                                ✅ Save & Add to KB
                                            </button>
                                            <button className="btn btn-ghost" onClick={() => setExpandedId(null)}>
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="card-actions">
                                        <button className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.9rem' }} onClick={() => setExpandedId(q.id)}>
                                            ✍️ Answer
                                        </button>
                                        <button className="btn btn-danger" style={{ fontSize: '0.82rem', padding: '0.4rem 0.9rem' }} onClick={() => dismissPending(q.id)}>
                                            Dismiss
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </>
                )}

                {/* ===== KB SECTION ===== */}
                {section === 'kb' && (
                    <>
                        <div className="admin-section-title">📚 Knowledge Base ({kb.length} entries)</div>

                        {/* Add Entry Form */}
                        <div className="form-add">
                            <div className="form-add-title">➕ Add New Entry</div>
                            <div className="form-field">
                                <label className="form-label">Question</label>
                                <input
                                    className="form-input"
                                    placeholder="e.g. How do I reset my password?"
                                    value={addForm.question}
                                    onChange={e => setAddForm(f => ({ ...f, question: e.target.value }))}
                                />
                            </div>
                            <div className="form-field">
                                <label className="form-label">Answer</label>
                                <textarea
                                    className="form-textarea"
                                    rows={3}
                                    placeholder="Type the answer..."
                                    value={addForm.answer}
                                    onChange={e => setAddForm(f => ({ ...f, answer: e.target.value }))}
                                />
                            </div>
                            <button
                                className="btn btn-success"
                                onClick={addKBEntry}
                                disabled={addLoading || !addForm.question.trim() || !addForm.answer.trim()}
                            >
                                {addLoading ? <><span className="spinner" /> Embedding...</> : '✅ Add to Knowledge Base'}
                            </button>
                        </div>

                        {loading && <div className="empty-state"><span className="spinner" /> Loading...</div>}
                        {!loading && kb.length === 0 && (
                            <div className="empty-state">
                                <div className="empty-state-icon">📭</div>
                                Knowledge base is empty. Add your first entry above!
                            </div>
                        )}

                        {kb.map(entry => (
                            <div key={entry.id} className="card">
                                <div className="card-question">{entry.question}</div>

                                {editId === entry.id ? (
                                    <div>
                                        <textarea
                                            className="form-textarea"
                                            rows={3}
                                            value={editAnswer}
                                            onChange={e => setEditAnswer(e.target.value)}
                                            style={{ marginBottom: '0.5rem' }}
                                        />
                                        <div className="card-actions">
                                            <button className="btn btn-success" style={{ fontSize: '0.82rem', padding: '0.4rem 0.9rem' }} onClick={() => saveEdit(entry.id)}>💾 Save</button>
                                            <button className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '0.4rem 0.9rem' }} onClick={() => setEditId(null)}>Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="card-answer">{entry.answer}</div>
                                        <div className="card-meta">
                                            <span className={`tag tag-${entry.source === 'admin' || entry.source === 'admin_from_pending' ? 'admin' : 'answered'}`}>
                                                {entry.source}
                                            </span>
                                            {new Date(entry.created_at).toLocaleDateString()}
                                        </div>
                                        <div className="card-actions">
                                            <button className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '0.4rem 0.9rem' }} onClick={() => { setEditId(entry.id); setEditAnswer(entry.answer) }}>
                                                ✏️ Edit
                                            </button>
                                            <button className="btn btn-danger" style={{ fontSize: '0.82rem', padding: '0.4rem 0.9rem' }} onClick={() => deleteKBEntry(entry.id)}>
                                                🗑 Delete
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    )
}
