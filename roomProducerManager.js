// room-producer-manager.js
class RoomProducerManager {
    constructor() {
        this.roomProducers = new Map(); // Map<roomId, Set<{producerId, socketId}>>
    }

    addProducerToRoom(roomId, producerId, socketId) {
        if (!this.roomProducers.has(roomId)) {
            this.roomProducers.set(roomId, new Set());
        }
        this.roomProducers.get(roomId).add({ producerId, socketId });
    }

    removeProducerFromRoom(roomId, producerId) {
        const producers = this.roomProducers.get(roomId);
        if (producers) {
            for (const producer of producers) {
                if (producer.producerId === producerId) {
                    producers.delete(producer);
                    break;
                }
            }
        }
    }

    getProducersInRoom(roomId) {
        return Array.from(this.roomProducers.get(roomId) || []);
    }

    removeUserFromAllRooms(socketId) {
        for (const [roomId, producers] of this.roomProducers.entries()) {
            for (const producer of Array.from(producers)) {
                if (producer.socketId === socketId) {
                    producers.delete(producer);
                }
            }
        }
    }
}

export default RoomProducerManager;