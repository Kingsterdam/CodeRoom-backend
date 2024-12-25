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
    socket.on("joinRoom", (room) => {
        socket.join(room);
        console.log(`User ${socket.id} joined room: ${room}`);
    });

    // Handle incoming messages
    socket.on("message", ({ room, message }) => {
        let { name, text, time } = message; // Destructure the message object for clarity
    
        // Append something to the name
        name = `${'friend of '+name}`; // Example: Appending "(appended text)" to the name
    
        console.log(`Message from ${name} (${socket.id}) to room ${room}: "${text}" at ${time}`);
    
        // Emit the modified message to all clients in the room except the sender
        socket.to(room).emit("message", { name, text, time });
    });
    
    
    // Handle disconnection
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

console.log("Socket.IO server running on http://localhost:3002");
