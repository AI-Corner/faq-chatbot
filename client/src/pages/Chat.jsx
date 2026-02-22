import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

const WELCOME = {
    id: 'welcome',
    role: 'bot',
    text: "👋 Hi! I'm your FAQ assistant. Ask me anything — if I don't know the answer yet, your question will be sent to our team!",
    answered: true,
}

export default function Chat() {
    const [messages, setMessages] = useState([WELCOME])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const bottomRef = useRef(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const send = async () => {
        const question = input.trim()
        if (!question || loading) return

        setInput('')
        const userMsg = { id: Date.now(), role: 'user', text: question }
        setMessages(prev => [...prev, userMsg])
        setLoading(true)

        try {
            const { data } = await axios.post(`${API}/api/chat`, {
                question,
                sessionId: 'user-' + Date.now(),
            })

            const botMsg = {
                id: Date.now() + 1,
                role: 'bot',
                text: data.answer,
                answered: data.answered,
                sources: data.sources,
            }
            setMessages(prev => [...prev, botMsg])
        } catch (err) {
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                role: 'bot',
                text: '⚠️ Something went wrong. Please try again.',
                answered: true,
            }])
        } finally {
            setLoading(false)
        }
    }

    const handleKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
        }
    }

    return (
        <div className="chat-page page">
            <div className="chat-messages">
                {messages.map(msg => (
                    <div key={msg.id} className={`message ${msg.role}`}>
                        <div className={`avatar ${msg.role}`}>
                            {msg.role === 'bot' ? '🛡️' : '👤'}
                        </div>
                        <div className={`bubble ${!msg.answered ? 'unanswered' : ''}`}>
                            {msg.text}
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="sources-list">
                                    📚 Answered from KB:
                                    {msg.sources.map((s, i) => (
                                        <span key={i} className="source-chip" title={s.question}>
                                            #{s.id} ({(parseFloat(s.score) * 100).toFixed(0)}% match)
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="message bot">
                        <div className="avatar bot">🤖</div>
                        <div className="bubble">
                            <div className="typing-indicator">
                                <span /><span /><span />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            <div className="chat-input-area">
                <input
                    className="chat-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Ask a question..."
                    disabled={loading}
                    autoFocus
                />
                <button className="btn btn-primary" onClick={send} disabled={loading || !input.trim()}>
                    {loading ? <span className="spinner" /> : '➤ Send'}
                </button>
            </div>
        </div >
    )
}
