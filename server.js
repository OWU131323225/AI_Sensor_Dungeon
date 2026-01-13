require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

const PROVIDER = 'gemini'; 
const MODEL_GEMINI = 'gemma-3-4b-it'; // または 
const MODEL_OPENAI = 'gpt-4o-mini';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_GEMINI}:generateContent`;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

io.on('connection', (socket) => {
    socket.on('join', (room) => {
        socket.join(room);
        console.log(`クライアントがルームに参加: ${room}`);
    });

    socket.on('sensor', (data) => {
        socket.to('game').emit('sensor_update', data);
    });
});

app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body;

    try {
        let replyText = "";
        if (PROVIDER === 'gemini') {
            replyText = await callGemini(message, history);
        } else {
            replyText = await callOpenAI(message, history);
        }
        
        console.log("------------------------------------------------");
        console.log("📖 AIの物語:", replyText); 
        console.log("------------------------------------------------");

        res.json({ reply: replyText });
    } catch (error) {
        console.error("AI Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});


async function callGemini(prompt, history) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API Key missing");
    
    const validHistory = (history || []).filter(item => {
        return item.parts && item.parts[0] && item.parts[0].text && item.parts[0].text.trim() !== "";
    });

    const currentContent = { role: "user", parts: [{ text: prompt }] };
    
    const contents = [...validHistory, currentContent];

    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: contents, 
            generationConfig: { maxOutputTokens: 1000 }
        })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        console.error("Gemini Error Details:", JSON.stringify(data, null, 2));
        throw new Error(data.error?.message || 'Gemini Error');
    }
    
    if (!data.candidates || !data.candidates[0].content) {
        throw new Error("AIからの応答が空でした");
    }

    return data.candidates[0].content.parts[0].text;
}

async function callOpenAI(prompt, history) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI API Key missing");

    const messages = [
        { role: "system", content: "あなたはダンジョンマスターです。" },
        ...(history || []).map(h => ({
            role: h.role === "model" ? "assistant" : "user",
            content: h.parts[0].text
        })),
        { role: "user", content: prompt }
    ];

    const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: MODEL_OPENAI,
            messages: messages,
            max_completion_tokens: 300
        })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'OpenAI Error');
    return data.choices[0].message.content;
}

const PORT = 8080;
server.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));