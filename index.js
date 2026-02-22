require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');
const requireAuth = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SIMILARITY_THRESHOLD = parseFloat(process.env.SIMILARITY_THRESHOLD || '0.75');
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-2.5-flash';
const EMBEDDING_MODEL = 'gemini-embedding-001';

if (!GOOGLE_API_KEY) {
    console.error('ERROR: GOOGLE_API_KEY missing in .env');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

// ------- Helpers -------

async function getEmbedding(text) {
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(text);
    return result.embedding.values;
}

async function generateAnswer(userQuestion, contextEntries) {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const contextText = contextEntries
        .map((e, i) => `[${i + 1}] Q: ${e.question}\n    A: ${e.answer}`)
        .join('\n\n');

    const prompt = `You are a helpful FAQ assistant. Use the following knowledge base context to answer the user's question accurately and concisely.

KNOWLEDGE BASE CONTEXT:
${contextText}

USER QUESTION: ${userQuestion}

Instructions:
- Only use information from the context above.
- If the context doesn't fully answer the question, say so honestly.
- Keep the answer concise and friendly.
- Do NOT make up information not in the context.`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}

// ------- Chat Endpoint -------

app.post('/api/chat', async (req, res) => {
    const { question, sessionId = 'anonymous' } = req.body;
    if (!question || !question.trim()) {
        return res.status(400).json({ error: 'Question is required.' });
    }

    try {
        console.log(`[Chat] Question: "${question}"`);
        const embedding = await getEmbedding(question);
        const matches = db.findTopMatches(embedding, 3, SIMILARITY_THRESHOLD);

        if (matches.length > 0) {
            console.log(`[Chat] Found ${matches.length} match(es), top score: ${matches[0].score.toFixed(3)}`);
            const answer = await generateAnswer(question, matches);
            return res.json({
                answered: true,
                answer,
                sources: matches.map(m => ({ id: m.id, question: m.question, score: m.score.toFixed(3) })),
            });
        }

        // No match — save as pending
        console.log('[Chat] No match found — adding to pending queue');
        const pendingId = db.addPendingQuestion(question, sessionId);
        return res.json({
            answered: false,
            pendingId,
            answer: "I don't have an answer for that yet. Your question has been forwarded to our team and will be answered shortly!",
        });
    } catch (err) {
        console.error('[Chat] Error:', err.message);
        res.status(500).json({ error: 'Failed to process question.', details: err.message });
    }
});

// ------- Knowledge Base CRUD -------

app.get('/api/kb', requireAuth, (req, res) => {
    res.json(db.getAllKBEntries());
});

app.post('/api/kb', requireAuth, async (req, res) => {
    const { question, answer } = req.body;
    if (!question || !answer) {
        return res.status(400).json({ error: 'question and answer are required.' });
    }
    try {
        const embedding = await getEmbedding(question);
        const id = db.addKBEntry(question, answer, embedding);
        res.json({ id, message: 'Entry added to knowledge base.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add KB entry.', details: err.message });
    }
});

app.put('/api/kb/:id', requireAuth, async (req, res) => {
    const { answer } = req.body;
    if (!answer) return res.status(400).json({ error: 'answer is required.' });
    db.updateKBEntry(req.params.id, answer);
    res.json({ message: 'Entry updated.' });
});

app.delete('/api/kb/:id', requireAuth, (req, res) => {
    db.deleteKBEntry(req.params.id);
    res.json({ message: 'Entry deleted.' });
});

// ------- Pending Questions (Admin) -------

app.get('/api/pending', requireAuth, (req, res) => {
    res.json(db.getPendingQuestions());
});

app.get('/api/pending/all', requireAuth, (req, res) => {
    res.json(db.getAllPendingQuestions());
});

// Admin answers a pending question → adds it to KB
app.post('/api/pending/:id/answer', requireAuth, async (req, res) => {
    const { answer } = req.body;
    if (!answer) return res.status(400).json({ error: 'answer is required.' });

    // Fetch the pending question
    const all = db.getAllPendingQuestions();
    const pending = all.find(p => p.id == req.params.id);
    if (!pending) return res.status(404).json({ error: 'Pending question not found.' });

    try {
        const embedding = await getEmbedding(pending.question);
        const kbId = db.addKBEntry(pending.question, answer, embedding, 'admin_from_pending');
        db.updatePendingStatus(req.params.id, 'answered');
        res.json({ message: 'Answer saved to knowledge base.', kbId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to answer question.', details: err.message });
    }
});

app.post('/api/pending/:id/dismiss', requireAuth, (req, res) => {
    db.updatePendingStatus(req.params.id, 'dismissed');
    res.json({ message: 'Question dismissed.' });
});

// ------- Start -------

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`✅ FAQ Chatbot server running on http://localhost:${PORT}`);
    console.log(`   Model: ${MODEL_NAME} | Threshold: ${SIMILARITY_THRESHOLD}`);
});
