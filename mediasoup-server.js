// mediasoup-server.js
import mediasoup from 'mediasoup';

class MediasoupServer {
    constructor() {
        this.worker = null;
        this.router = null;
        this.transports = new Map(); // Map<userId, Map<transportId, {transport, isProducer}>>
        this.producers = new Map();
        this.consumers = new Map();
    }

    async init() {
        try {
            this.worker = await mediasoup.createWorker({
                logLevel: 'warn',
                logTags: [
                    'info',
                    'ice',
                    'dtls',
                    'rtp',
                    'srtp',
                    'rtcp',
                ],
                rtcMinPort: 40000,
                rtcMaxPort: 49999,
            });

            const mediaCodecs = [
                {
                    kind: 'audio',
                    mimeType: 'audio/opus',
                    clockRate: 48000,
                    channels: 2
                }
            ];

            this.router = await this.worker.createRouter({ mediaCodecs });
            console.log('Mediasoup worker and router created successfully');
        } catch (error) {
            console.error('Failed to initialize mediasoup server:', error);
            throw error;
        }
    }

    getRouter() {
        if (!this.router) {
            throw new Error('Router not initialized');
        }
        return this.router;
    }

    async createWebRtcTransport() {
        const transport = await this.router.createWebRtcTransport({
            listenIps: [
                {
                    ip: '127.0.0.1',
                    announcedIp: null,
                }
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            initialAvailableOutgoingBitrate: 1000000,
        });

        return {
            transport,
            params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            }
        };
    }

    addTransport(userId, transport, isProducer) {
        if (!this.transports.has(userId)) {
            this.transports.set(userId, new Map());
        }
        this.transports.get(userId).set(transport.id, { transport, isProducer });
    }

    getTransport(userId, transportId, isProducer = null) {
        const userTransports = this.transports.get(userId);
        if (!userTransports) {
            throw new Error(`No transports found for user ${userId}`);
        }
        const transportData = userTransports.get(transportId);
        if (!transportData) {
            throw new Error(`Transport ${transportId} not found`);
        }
        if (isProducer !== null && transportData.isProducer !== isProducer) {
            throw new Error(`Transport ${transportId} is not a ${isProducer ? 'producer' : 'consumer'} transport`);
        }
        return transportData.transport;
    }

    addProducer(userId, producer) {
        if (!this.producers.has(userId)) {
            this.producers.set(userId, new Map());
        }
        this.producers.get(userId).set(producer.id, producer);
    }

    getProducers() {
        const allProducers = [];
        for (const [userId, producers] of this.producers) {
            for (const [producerId, producer] of producers) {
                allProducers.push({
                    id: producerId,
                    socketId: userId,
                    kind: producer.kind
                });
            }
        }
        return allProducers;
    }

    getProducersBySocketId(socketId) {
        return Array.from(this.producers.get(socketId)?.values() || []);
    }

    addConsumer(userId, consumer) {
        if (!this.consumers.has(userId)) {
            this.consumers.set(userId, new Map());
        }
        this.consumers.get(userId).set(consumer.id, consumer);
    }

    getConsumer(userId, consumerId) {
        const userConsumers = this.consumers.get(userId);
        if (!userConsumers) {
            throw new Error(`No consumers found for user ${userId}`);
        }
        const consumer = userConsumers.get(consumerId);
        if (!consumer) {
            throw new Error(`Consumer ${consumerId} not found`);
        }
        return consumer;
    }

    removeUser(userId) {
        // Clean up user's transports
        const userTransports = this.transports.get(userId);
        if (userTransports) {
            for (const [_, { transport }] of userTransports) {
                transport.close();
            }
            this.transports.delete(userId);
        }

        // Clean up user's producers
        const userProducers = this.producers.get(userId);
        if (userProducers) {
            for (const producer of userProducers.values()) {
                producer.close();
            }
            this.producers.delete(userId);
        }

        // Clean up user's consumers
        const userConsumers = this.consumers.get(userId);
        if (userConsumers) {
            for (const consumer of userConsumers.values()) {
                consumer.close();
            }
            this.consumers.delete(userId);
        }
    }
}

const mediasoupServer = new MediasoupServer();
export default mediasoupServer;