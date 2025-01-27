// server.js
import { Server } from "socket.io";
import mediasoupServer from './mediasoup-server.js';
import RoomProducerManager from './roomProducerManager.js';
const roomProducerManager = new RoomProducerManager();

const io = new Server(3002, {
    cors: {
        origin: "http://localhost:3001",
        methods: ["GET", "POST"],
        credentials: true,
    },
});

// Initialize mediasoup server
await mediasoupServer.init();

const peers = new Map();
const rooms = new Map();
const MAX_USERS_PER_ROOM = 20;


io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);

    // Add peer to the map
    peers.set(socket.id, {
        socket,
        producers: new Map(),
        consumers: new Map(),
        producerTransport: null,
        consumerTransport: null
    });

    // Emit current peers to everyone
    io.emit('peers', Array.from(peers.keys()));

    socket.on('getRouterRtpCapabilities', async () => {
        let attempts = 0;
        const maxAttempts = 3;
        // console.log("room: ", roomId)
        const attemptConnection = async () => {
            try {
                const router = await mediasoupServer.getRouter();
                socket.emit('routerRtpCapabilities', router.rtpCapabilities);
            } catch (error) {
                attempts++;
                console.error(`Error getting router capabilities (attempt ${attempts}):`, error);

                if (attempts < maxAttempts) {
                    setTimeout(attemptConnection, 1000 * attempts); // Exponential backoff
                } else {
                    socket.emit('error', {
                        type: 'ROUTER_CAPABILITIES_ERROR',
                        message: error.message,
                        recoverable: false
                    });
                }
            }
        };

        await attemptConnection();
    });

    socket.on('createWebRtcTransport', async ({ sender }) => {
        try {
            const { transport, params } = await mediasoupServer.createWebRtcTransport();
            mediasoupServer.addTransport(socket.id, transport, sender);
            socket.emit('transportCreated', { params, sender });
        } catch (error) {
            console.error('Error creating transport:', error);
            socket.emit('error', error.message);
        }
    });

    socket.on('connectTransport', async ({ transportId, dtlsParameters }) => {
        try {
            const transport = mediasoupServer.getTransport(socket.id, transportId);
            await transport.connect({ dtlsParameters });
            socket.emit('transportConnected');
        } catch (error) {
            console.error('Error connecting transport:', error);
            socket.emit('error', error.message);
        }
    });

    socket.on('produce', async ({ transportId, kind, rtpParameters, roomId }, callback) => {
        try {
            console.log("inside the produce event", roomId, socket.id, transportId, kind, rtpParameters);
            const transport = mediasoupServer.getTransport(socket.id, transportId, true);
            const producer = await transport.produce({ kind, rtpParameters });
            mediasoupServer.addProducer(socket.id, producer);

            // Add producer to room tracking
            roomProducerManager.addProducerToRoom(roomId, producer.id, socket.id);

            // Only emit to users in the same room
            socket.broadcast.emit('newProducer', {
                producerId: producer.id,
                producerSocketId: socket.id,
                roomId: roomId
            });

            callback({ producerId: producer.id });
        } catch (error) {
            console.error('Error in produce event:', error);
            socket.emit('error', {
                type: 'PRODUCE_ERROR',
                message: error.message
            });
        }
    });


    socket.on('consume', async ({ producerId, rtpCapabilities, transportId, roomId }) => {
        try {
            // Verify producer is in the same room
            const roomProducers = roomProducerManager.getProducersInRoom(roomId);
            const validProducer = roomProducers.find(p => p.producerId === producerId);
            
            if (!validProducer) {
                console.log('Producer not found in room');
                return;
            }
    
            const router = await mediasoupServer.getRouter();
            const transport = mediasoupServer.getTransport(socket.id, transportId, false);
    
            if (!router.canConsume({ producerId, rtpCapabilities })) {
                throw new Error('Cannot consume the producer');
            }
    
            const consumer = await transport.consume({
                producerId,
                rtpCapabilities,
                paused: true
            });
    
            mediasoupServer.addConsumer(socket.id, consumer);
    
            socket.emit('consumerCreated', {
                consumerId: consumer.id,
                producerId: consumer.producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
                type: consumer.type,
                producerPaused: consumer.producerPaused
            });
    
        } catch (error) {
            console.error('Error creating consumer:', error);
            socket.emit('error', error.message);
        }
    });

    socket.on('resumeConsumer', async ({ consumerId }) => {
        try {
            const consumer = mediasoupServer.getConsumer(socket.id, consumerId);
            await consumer.resume();
        } catch (error) {
            console.error('Error resuming consumer:', error);
            socket.emit('error', error.message);
        }
    });

    // Remove the duplicate disconnect handler and enhance the remaining one
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        // Remove from room-producer tracking
        roomProducerManager.removeUserFromAllRooms(socket.id);

        // Existing cleanup code...
        const peer = peers.get(socket.id);
        if (peer) {
            peer.producers.forEach(producer => producer.close());
            peer.consumers.forEach(consumer => consumer.close());
            if (peer.producerTransport) peer.producerTransport.close();
            if (peer.consumerTransport) peer.consumerTransport.close();
        }

        peers.delete(socket.id);
        io.emit('peers', Array.from(peers.keys()));
        mediasoupServer.removeUser(socket.id);
    });


    socket.on("joinRoom", ({ room, message }) => {
        const currentRoom = rooms.get(room) || new Set();
        console.log(`User joined: `, message, room)
        if (currentRoom.size >= MAX_USERS_PER_ROOM) {
            socket.emit('error', {
                type: 'ROOM_FULL',
                message: 'Room has reached maximum capacity'
            });
            return;
        }

        currentRoom.add(socket.id);
        rooms.set(room, currentRoom);
        socket.join(room);

        let { type, name, time, email } = message;
        console.log("Socket id: ", socket.id)
        socket.to(room).emit("message", {
            type: type,
            email,
            name,
            text: `${name} has joined`,
            time
        });
    });

    socket.on("leaveRoom", ({ room, message }) => {
        let { type, name, time, email } = message;
        // name = `${'friend of ' + name}`;
        socket.leave(room);
        console.log(`${name} left room: ${room}`);
        socket.to(room).emit("message", { type: type, name, email, text: `${name} has left`, time });
    });

    socket.on("message", ({ room, message }) => {
        console.log("room in message: ", room)
        let { type, name, text, time, editorId } = message;
        name = `${'friend of ' + name}`;
        console.log("This is the message", message);
        socket.to(room).emit("message", { type, name, text, time, editorId });
    });

    socket.on("languageUpdate", ({ room, message }) => {
        let { type, language, editorId } = message;
        socket.to(room.room).emit("languageUpdate", { type, language, editorId });
    });

    socket.on("editorUpdate", ({ room, message }) => {
        let { type, instruction, id } = message;
        socket.to(room.room).emit("editorUpdate", { type, instruction, id });
    });

    socket.on('drawingUpdate', ({ room, data }) => {
        console.log("SERVER: Drawing data", data);
        console.log("room: ", room)
        socket.to(room).emit("drawingUpdate", { data })
    })

    socket.on('cursorUpdate', ({ room, data }) => {
        console.log("SERVER: Cursor data", data);
        console.log("room: ", room)
        socket.to(room).emit("cursorUpdate", { data })
    })

    socket.on('cursorUpdate', ({ room, data }) => {
        console.log("SERVER: Cursor data", data);
        console.log("room: ", room)
        socket.to(room).emit("cursorUpdate", { data })
    })

    socket.on('muteUpdate', ({ room, data }) => {
        console.log("Received mute message", data);
        socket.to(room).emit("muteUpdate", { data })
    })

    socket.on('removeUser', ({ room, data }) => {
        console.log("Received remove message: ", data);
        socket.to(room).emit("removeUser", { data })
    })

    // Handle disconnection
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

console.log("Socket.IO server running on http://localhost:3002");