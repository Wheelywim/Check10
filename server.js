// server.js

// -----------------
// 1. INITIALIZATION
// -----------------
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow connections from any origin, useful for local testing
    }
});

// Serve the static files (index.html, etc.) from the 'public' folder
app.use(express.static('public'));

// This object will hold all active game rooms, keyed by roomId
const rooms = {};

// ---------------------------------
// 2. SERVER-SIDE GAME LOGIC ENGINE
// (Adapted from your original frontend code, with all DOM manipulation removed)
// ---------------------------------
class Check10Game {
    constructor() {
        this.board = [];
        this.currentPlayer = 'white';
        this.whiteScore = 0;
        this.blackScore = 0;
        this.gameOver = false;
        this.gameState = 'playing'; // 'playing', 'choosing_promotion'
        this.promotionChoices = null;
        this.promotionPoints = 0;
        this.lastMoveInfo = null; // Store info about the last move for the client

        this.initializeBoard();
        this.checkGameEnd();
    }

    // --- State & Initialization ---
    initializeBoard() {
        this.board = Array(8).fill(null).map(() => Array(8).fill(null));
        const blackRow1 = [8, 7, 6, 5, 4, 3, 2, 1];
        const blackRow2 = [1, 2, 3, 4, 5, 6, 7, 8];
        const whiteRow1 = [8, 7, 6, 5, 4, 3, 2, 1];
        const whiteRow2 = [1, 2, 3, 4, 5, 6, 7, 8];
        for (let col = 0; col < 8; col++) {
            this.board[0][col] = { color: 'black', number: blackRow1[col], promoted: false };
            this.board[1][col] = { color: 'black', number: blackRow2[col], promoted: false };
            this.board[6][col] = { color: 'white', number: whiteRow1[col], promoted: false };
            this.board[7][col] = { color: 'white', number: whiteRow2[col], promoted: false };
        }
    }

    // Returns a snapshot of the current state, safe to send to clients
    getState() {
        return {
            board: this.board,
            currentPlayer: this.currentPlayer,
            whiteScore: this.whiteScore,
            blackScore: this.blackScore,
            gameOver: this.gameOver,
            gameState: this.gameState,
            promotionChoices: this.promotionChoices,
            lastMoveInfo: this.lastMoveInfo,
        };
    }

    // --- Core Move Logic (Server is the single source of truth) ---
    makeMove(fromRow, fromCol, toRow, toCol) {
        if (!this.isValidMove(fromRow, fromCol, toRow, toCol)) {
            return { success: false, reason: "Invalid move." };
        }

        const piece = this.board[fromRow][fromCol];
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        let pointsScored = 0;
        let message = "";
        let combinationsFound = [];

        this.lastMoveInfo = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol }};

        // Check for promotion FIRST
        if (this.checkPromotion(toRow, toCol)) {
            const promotionResult = this.processPromotion(toRow, toCol);
            
            if (promotionResult.points > 0) {
                pointsScored += promotionResult.points;
                message += `Promoted and captured an opponent ${piece.number}! `;
            } else if (promotionResult.choices) {
                // The game must now wait for the player to make a choice
                this.gameState = 'choosing_promotion';
                this.promotionChoices = promotionResult.choices;
                this.promotionPoints = piece.number;
                return { success: true, state: this.getState() }; // Return early
            }
        }
        
        // Then, check for combinations
        const combinations = this.checkCombinationsAroundPosition(toRow, toCol);
        if (combinations.length > 0) {
            pointsScored += this.processCombinations(combinations);
            combinationsFound = combinations; // Store for client-side highlighting
            message += `Formed a combination scoring ${pointsScored} points! `;
        }
        
        this.lastMoveInfo.combinations = combinationsFound;

        if (pointsScored > 0) {
            if (this.currentPlayer === 'white') this.whiteScore += pointsScored;
            else this.blackScore += pointsScored;
        }

        if (!message) {
            message = `${this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1)} moved ${piece.number}.`;
        }
        this.lastMoveInfo.message = message;

        // Switch player and check for game end
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        this.checkGameEnd();
        
        return { success: true, state: this.getState() };
    }
    
    handlePromotionChoice(row, col) {
        if (this.gameState !== 'choosing_promotion') return { success: false, reason: "Not in promotion state." };

        const choice = this.promotionChoices.find(p => p.row === row && p.col === col);
        if (!choice) return { success: false, reason: "Invalid promotion choice." };
        
        // Remove the chosen piece
        this.board[row][col] = null;
        
        const points = this.promotionPoints;
        if (this.currentPlayer === 'white') this.whiteScore += points;
        else this.blackScore += points;

        // Reset promotion state
        this.gameState = 'playing';
        this.promotionChoices = null;
        this.promotionPoints = 0;
        
        this.lastMoveInfo = {
            message: `${this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1)} chose a promotion target and scored ${points} points!`
        };
        
        // Switch player and check for game end
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        this.checkGameEnd();

        return { success: true, state: this.getState() };
    }

    // --- Pure Logic Functions (no DOM) ---
    isValidMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        if (!piece || piece.color !== this.currentPlayer) return false;
        if (toRow < 0 || toRow > 7 || toCol < 0 || toCol > 7) return false;
        if (this.board[toRow][toCol]) return false;

        const validMoves = this.getValidMoves(fromRow, fromCol);
        return validMoves.some(move => move.row === toRow && move.col === toCol);
    }
    
    getValidMoves(row, col) {
        const validMoves = [];
        const piece = this.board[row][col];
        if (!piece) return validMoves;
        const direction = piece.color === 'white' ? -1 : 1;
        const newRow = row + direction;

        if (newRow >= 0 && newRow < 8) {
            // Forward move
            if (!this.board[newRow][col]) {
                validMoves.push({ row: newRow, col });
            }
            // Diagonal moves
            for (const deltaCol of [-1, 1]) {
                const newCol = col + deltaCol;
                if (newCol >= 0 && newCol < 8 && !this.board[newRow][newCol]) {
                    validMoves.push({ row: newRow, col: newCol });
                }
            }
        }
        return validMoves;
    }
    
    checkPromotion(row, col) {
        const piece = this.board[row][col];
        if (!piece) return false;
        if ((piece.color === 'white' && row === 0) || (piece.color === 'black' && row === 7)) {
            if (!piece.promoted) {
                piece.promoted = true;
                return true;
            }
        }
        return false;
    }

    processPromotion(row, col) {
        const piece = this.board[row][col];
        const opponentColor = piece.color === 'white' ? 'black' : 'white';
        const matchingPieces = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const targetPiece = this.board[r][c];
                if (targetPiece && targetPiece.color === opponentColor && targetPiece.number === piece.number && !targetPiece.promoted) {
                    matchingPieces.push({ row: r, col: c });
                }
            }
        }
        if (matchingPieces.length === 0) return { points: 0 };
        if (matchingPieces.length === 1) {
            this.board[matchingPieces[0].row][matchingPieces[0].col] = null;
            return { points: piece.number };
        } else {
            return { choices: matchingPieces };
        }
    }
    
    checkCombinationsAroundPosition(centerRow, centerCol) { /* ... same as your frontend ... */ return []; }
    processCombinations(combinations) { /* ... same as your frontend ... */ return 0; }
    // NOTE: You would need to copy your `checkCombinationsAroundPosition`, `findValidCombinations`, `areConnectedOptimized`, and `processCombinations` logic here.
    // For brevity in this example, they are stubbed out.

    checkGameEnd() {
        if (!this.hasValidMoves(this.currentPlayer)) {
            this.gameOver = true;
            // Final scoring would happen here
        }
    }
    
    hasValidMoves(player) {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if (this.board[row][col] && this.board[row][col].color === player) {
                    if (this.getValidMoves(row, col).length > 0) return true;
                }
            }
        }
        return false;
    }
}


// ---------------------------------
// 3. SOCKET.IO EVENT HANDLING
// ---------------------------------
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // --- Handle Player Joining ---
    let availableRoomId = Object.keys(rooms).find(id => rooms[id] && rooms[id].players.length === 1);

    if (availableRoomId) {
        const room = rooms[availableRoomId];
        room.players.push({ id: socket.id, color: 'black' });
        socket.join(availableRoomId);
        
        console.log(`Player ${socket.id} joined room ${availableRoomId} as Black.`);
        
        // Both players are now in the room, start the game.
        io.to(availableRoomId).emit('gameStart', { 
            roomId: availableRoomId,
            players: room.players,
            initialState: room.game.getState()
        });
    } else {
        const newRoomId = uuidv4();
        socket.join(newRoomId);
        rooms[newRoomId] = {
            id: newRoomId,
            players: [{ id: socket.id, color: 'white' }],
            game: new Check10Game() // A new game instance for this room
        };
        console.log(`Player ${socket.id} created room ${newRoomId} as White.`);
        socket.emit('waitingForOpponent', { roomId: newRoomId });
    }

    // --- Handle Player Moves ---
    socket.on('makeMove', (data) => {
        const { roomId, from, to } = data;
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.color !== room.game.currentPlayer) {
            socket.emit('error', { message: "Not your turn or not in this game." });
            return;
        }

        const result = room.game.makeMove(from.row, from.col, to.row, to.col);
        
        if (result.success) {
            // Broadcast the new state to everyone in the room.
            io.to(roomId).emit('gameStateUpdate', result.state);
        } else {
            // Send an error back to the player who made the invalid move.
            socket.emit('invalidMove', { message: result.reason });
        }
    });
    
    // --- Handle Promotion Choices ---
    socket.on('promotionChoice', (data) => {
        const { roomId, choice } = data;
        const room = rooms[roomId];
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.color !== room.game.currentPlayer) return;

        const result = room.game.handlePromotionChoice(choice.row, choice.col);
        if(result.success) {
            io.to(roomId).emit('gameStateUpdate', result.state);
        } else {
            socket.emit('invalidMove', { message: result.reason });
        }
    });

    // --- Handle Disconnections ---
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        // Find which room the player was in and notify the opponent.
        const roomId = Object.keys(rooms).find(id => rooms[id].players.some(p => p.id === socket.id));
        if (roomId) {
            io.to(roomId).emit('opponentDisconnected');
            // Clean up the room from memory
            delete rooms[roomId];
            console.log(`Room ${roomId} closed.`);
        }
    });
});


// -----------------
// 4. START SERVER
// -----------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});