const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Support a configurable DB path (set DB_PATH env var to use a mounted volume in K8s)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'faq.db');

// Ensure the directory exists (important for mounted volumes in K8s)
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge_base (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    question   TEXT NOT NULL,
    answer     TEXT NOT NULL,
    embedding       TEXT,       -- JSON array of numbers
    source          TEXT DEFAULT 'admin',
    likes           INTEGER DEFAULT 0,
    review_requests INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pending_questions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    question   TEXT NOT NULL,
    session_id TEXT,
    status     TEXT DEFAULT 'pending',  -- 'pending' | 'answered' | 'dismissed'
    asked_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: Add feedback columns if they don't exist
try {
    const columns = db.prepare("PRAGMA table_info(knowledge_base)").all();
    const hasLikes = columns.some(c => c.name === 'likes');
    const hasReview = columns.some(c => c.name === 'review_requests');

    if (!hasLikes) {
        db.exec("ALTER TABLE knowledge_base ADD COLUMN likes INTEGER DEFAULT 0");
        console.log("Added 'likes' column to knowledge_base");
    }
    if (!hasReview) {
        db.exec("ALTER TABLE knowledge_base ADD COLUMN review_requests INTEGER DEFAULT 0");
        console.log("Added 'review_requests' column to knowledge_base");
    }
} catch (err) {
    console.error("Migration error:", err.message);
}

// --- Knowledge Base Operations ---

function getAllKBEntries() {
    return db.prepare('SELECT id, question, answer, source, likes, review_requests, created_at FROM knowledge_base ORDER BY created_at DESC').all();
}

function getKBEntryById(id) {
    return db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id);
}

function addKBEntry(question, answer, embedding, source = 'admin') {
    const stmt = db.prepare(
        'INSERT INTO knowledge_base (question, answer, embedding, source) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(question, answer, JSON.stringify(embedding), source);
    return result.lastInsertRowid;
}

function updateKBEntry(id, answer) {
    db.prepare('UPDATE knowledge_base SET answer = ?, likes = 0, review_requests = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(answer, id);
}

function incrementLikes(id) {
    db.prepare('UPDATE knowledge_base SET likes = likes + 1 WHERE id = ?').run(id);
}

function incrementReviewRequests(id) {
    db.prepare('UPDATE knowledge_base SET review_requests = review_requests + 1 WHERE id = ?').run(id);
}

function deleteKBEntry(id) {
    db.prepare('DELETE FROM knowledge_base WHERE id = ?').run(id);
}

function getAllKBWithEmbeddings() {
    const rows = db.prepare('SELECT id, question, answer, embedding, likes, review_requests FROM knowledge_base WHERE embedding IS NOT NULL').all();
    return rows.map(r => ({ ...r, embedding: JSON.parse(r.embedding) }));
}

// --- Pending Questions Operations ---

function addPendingQuestion(question, sessionId) {
    // Avoid duplicate pending questions
    const existing = db.prepare("SELECT id FROM pending_questions WHERE question = ? AND status = 'pending'").get(question);
    if (existing) return existing.id;
    const result = db.prepare('INSERT INTO pending_questions (question, session_id) VALUES (?, ?)').run(question, sessionId);
    return result.lastInsertRowid;
}

function getPendingQuestions() {
    return db.prepare("SELECT * FROM pending_questions WHERE status = 'pending' ORDER BY asked_at DESC").all();
}

function getAllPendingQuestions() {
    return db.prepare("SELECT * FROM pending_questions ORDER BY asked_at DESC").all();
}

function updatePendingStatus(id, status) {
    db.prepare('UPDATE pending_questions SET status = ? WHERE id = ?').run(status, id);
}

// --- Cosine Similarity ---

function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
}

function findTopMatches(queryEmbedding, topN = 3, threshold = 0.75) {
    const entries = getAllKBWithEmbeddings();
    const scored = entries.map(entry => ({
        ...entry,
        score: cosineSimilarity(queryEmbedding, entry.embedding),
    }));
    return scored
        .filter(e => e.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
}

module.exports = {
    getAllKBEntries,
    getKBEntryById,
    addKBEntry,
    updateKBEntry,
    deleteKBEntry,
    getAllKBWithEmbeddings,
    addPendingQuestion,
    getPendingQuestions,
    getAllPendingQuestions,
    updatePendingStatus,
    findTopMatches,
    incrementLikes,
    incrementReviewRequests,
};
