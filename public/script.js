const socket = io();
const stripe = Stripe('pk_test_51QpFRrDs1prVIsJNubGI9dXBtMA8qkVltpFIMcOsDPUemjq1l8dSZLz2VCxdxQnptAGbR9DwNITZYCjS3NYUkUVN00awbntVHP');
const elements = stripe.elements();
const cardElement = elements.create('card');
cardElement.mount('#cardElement');

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const chatDiv = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');
const sendMessageButton = document.getElementById('sendMessage');
const nextButton = document.getElementById('nextButton');
const interestsDiv = document.getElementById('interests');
const startChatButton = document.getElementById('startChat');
const onlineUsersDiv = document.getElementById('onlineUsers');
const donorsTable = document.getElementById('donorsTable').getElementsByTagName('tbody')[0];

let localStream;
let peer;
let pairedUserId;

// Initialize WebRTC
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localVideo.srcObject = stream;
        localStream = stream;
    })
    .catch(error => {
        alert('Camera/mic access denied! Refresh and allow permissions.');
    });

// WebRTC Signaling
socket.on('signal', data => {
    if (!peer) createPeer(data.sender);
    peer.signal(data.signal);
});

function createPeer(targetId) {
    peer = new SimplePeer({ initiator: true, stream: localStream });
    
    peer.on('signal', signal => {
        socket.emit('signal', { target: targetId, signal });
    });

    peer.on('stream', stream => {
        remoteVideo.srcObject = stream;
    });

    peer.on('close', () => {
        peer = null;
        socket.emit('next'); // Auto-reconnect
    });
}

// Chat
socket.on('message', data => {
    const msg = document.createElement('div');
    msg.textContent = `User: ${data.message}`;
    chatDiv.appendChild(msg);
    chatDiv.scrollTop = chatDiv.scrollHeight;
});

sendMessageButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const message = messageInput.value;
    if (message && pairedUserId) {
        socket.emit('message', { target: pairedUserId, message });
        const msg = document.createElement('div');
        msg.textContent = `You: ${message}`;
        chatDiv.appendChild(msg);
        messageInput.value = '';
        chatDiv.scrollTop = chatDiv.scrollHeight;
    }
}

// Pairing
socket.on('paired', data => {
    pairedUserId = data.target;
    alert('Connected! Start chatting.');
});

socket.on('userDisconnected', () => {
    peer?.destroy();
    peer = null;
    alert('User disconnected. Reconnecting...');
    socket.emit('next');
});

// Start Chat Button
startChatButton.addEventListener('click', () => {
    const interests = Array.from(document.querySelectorAll('#interests input:checked'))
                          .map(input => input.value);
    if (interests.length === 0) {
        alert('Select at least one interest!');
        return;
    }
    interestsDiv.style.display = 'none';
    socket.emit('setInterests', interests);
});

// Donations
document.getElementById('donationForm').addEventListener('submit', async e => {
    e.preventDefault();
    const { token, error } = await stripe.createToken(cardElement);
    if (error) return alert(`Payment failed: ${error.message}`);
    
    const name = document.getElementById('donorName').value;
    const amount = document.getElementById('donationAmount').value;

    fetch('/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, amount, token }),
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('Donation successful!');
            fetchDonors();
        } else {
            alert(`Donation failed: ${data.error}`);
        }
    });
});

// PayPal Integration
paypal.Buttons({
    createOrder: (data, actions) => {
        const amount = document.getElementById('donationAmount').value;
        const name = document.getElementById('donorName').value;
        if (!name || !amount) return alert('Fill name and amount first!');
        return actions.order.create({
            purchase_units: [{
                amount: { value: amount },
                description: `Donation from ${name}`,
            }]
        });
    },
    onApprove: (data, actions) => {
        return actions.order.capture().then(details => {
            const name = document.getElementById('donorName').value;
            const amount = document.getElementById('donationAmount').value;
            fetch('/donate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, amount }),
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert('Donation successful!');
                    fetchDonors();
                }
            });
        });
    },
    onError: err => alert(`PayPal error: ${err}`)
}).render('#paypal-button-container');

// Fetch Donors
function fetchDonors() {
    fetch('/donors')
        .then(res => res.json())
        .then(data => {
            donorsTable.innerHTML = '';
            data.forEach(donor => {
                const row = donorsTable.insertRow();
                row.insertCell().textContent = donor.name;
                row.insertCell().textContent = `$${donor.amount}`;
            });
        });
}
fetchDonors();