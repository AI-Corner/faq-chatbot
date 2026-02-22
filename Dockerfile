# ===== Backend — FAQ Chatbot Server =====
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --production

# Copy source
COPY index.js db.js auth.js ./

# SQLite DB lives on a mounted volume at runtime
# /data is the volume mount point
ENV DB_PATH=/data/faq.db

EXPOSE 4000

CMD ["node", "index.js"]
