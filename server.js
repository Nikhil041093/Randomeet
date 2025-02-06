const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Stripe = require('stripe');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Initialize Stripe with your secret key
const stripe = Stripe('sk_test_51QpFRrDs1prVIsJN8hzGjOqKbV1TSTgWqUT2ACyM1xKKs4yJE0rOeUkvb6dB6GiZzDTTBqVRrt7eKy9CzafAN1qT00hMzm4ojn');

// Serve static files from the "public" directory
app.use(express.static('public'));
app.use(express.json());

let users = {};
let waitingUsers = [];
let donors = [];

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    // Add user to the list
    users[socket.id] = { socket, interests: [] };

    // Handle user interests
    socket.on('setInterests', (interests) => {
        users[socket.id].interests = interests;
        pairUsers(socket.id);
    });

    // Handle signaling for WebRTC
    socket.on('signal', (data) => {
        if (users[data.target]) {
            users[data.target].socket.emit('signal', {
                sender: socket.id,
                signal: data.signal,
            });
        }
    });

    // Handle text chat messages
    socket.on('message', (data) => {
        if (users[data.target]) {
            users[data.target].socket.emit('message', {
                sender: socket.id,
                message: data.message,
            });
        }
    });

    // Handle "Next" button
    socket.on('next', () => {
        if (users[socket.id].pairedWith) {
            const pairedUser = users[socket.id].pairedWith;
            users[pairedUser].pairedWith = null;
            users[pairedUser].socket.emit('userDisconnected');
            users[socket.id].pairedWith = null;
            pairUsers(socket.id);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
        if (users[socket.id].pairedWith) {
            const pairedUser = users[socket.id].pairedWith;
            users[pairedUser].socket.emit('userDisconnected');
        }
        delete users[socket.id];
    });

    // Pair users randomly or based on interests
    function pairUsers(userId) {
        const user = users[userId];
        if (waitingUsers.length > 0) {
            const pairedUserId = waitingUsers.pop();
            const pairedUser = users[pairedUserId];
            if (pairedUser && pairedUser.interests.some(interest => user.interests.includes(interest))) {
                user.pairedWith = pairedUserId;
                pairedUser.pairedWith = userId;
                user.socket.emit('paired', { target: pairedUserId });
                pairedUser.socket.emit('paired', { target: userId });
            } else {
                waitingUsers.push(pairedUserId);
                waitingUsers.push(userId);
            }
        } else {
            waitingUsers.push(userId);
        }
    }
});

// API to handle donations
app.post('/donate', async (req, res) => {
    const { name, amount, token } = req.body;

    try {
        if (token) {
            // Handle Stripe payment
            const charge = await stripe.charges.create({
                amount: amount * 100, // Convert to cents
                currency: 'usd',
                source: token.id, // Token from Stripe.js
                description: `Donation from ${name}`,
            });
        }

        // Save donor information
        donors.push({ name, amount });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Payment failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/donors', (req, res) => {
    res.status(200).json(donors);
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});