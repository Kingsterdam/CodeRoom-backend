import { Server } from "socket.io";

// Create a Socket.IO server instance on port 3002
const io = new Server(3002, {
    cors: {
        origin: "http://localhost:3001", // Update this to your frontend URL
        methods: ["GET", "POST"],
        credentials: true, // Allows cookies to be sent
    },
});

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Handle room joining
    socket.on("joinRoom", ({ room, message }) => {
        let { type, name, time } = message;
        socket.join(room);
        console.log(`User ${socket.id} joined room: ${room}`);

        socket.to(room).emit("message", { type: type, name, text: `user ${socket.id} has joined`, time });
    });

    socket.on("leaveRoom", ({ room, message }) => {
        let { type, name, time } = message;
        name = `${'friend of ' + name}`;
        socket.leave(room);
        console.log(`User ${socket.id} left room: ${room}`);

        // Notify other clients in the room about the user's departure
        socket.to(room).emit("message", { type: type, name, text: `user ${socket.id} has left`, time });
    });

    // Handle incoming messages
    socket.on("message", ({ room, message }) => {
        let { type, name, text, time } = message; // Destructure the message object for clarity

        // Append something to the name
        name = `${'friend of ' + name}`; // Example: Appending "(appended text)" to the name

        console.log(`Message from ${name} (${socket.id}) to room ${room}: "${text}" at ${time}`);

        // Emit the modified message to all clients in the room except the sender
        socket.to(room).emit("message", { type, name, text, time });
    });

    socket.on("languageChange", ({ room, language }) => {
        console.log(`User ${socket.id} changed language to: ${language}`);
        // Notify other clients about the language change
        socket.to(room).emit("languageChange", { user: socket.id, language });
    });

    // Handle disconnection
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

console.log("Socket.IO server running on http://localhost:3002");
