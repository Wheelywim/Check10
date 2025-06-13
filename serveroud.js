const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// The entire Check10Game class from your project goes here. 
// It is the game engine and does not need to change.
class Check10Game {
    constructor() {
        this.board = [];
        this.currentPlayer = 'white';
        this.selectedPiece = null;
        this.selectedPosition = null;
        this.whiteScore = 0;
        this.blackScore = 0;
        this.gameOver = false;
        this.gameState = 'playing'; // 'playing' or 'choosing_promotion'
        this.promotionChoices = null;
        this.promotionPoints = 0;
        this.gameHistory = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;
        this.initializeBoard();
        this.saveGameState(); // Initial state
    }

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

    getValidMoves(row, col) {
        const validMoves = [];
        const piece = this.board[row][col];
        if (!piece) return validMoves;
        const direction = piece.color === 'white' ? -1 : 1;
        const newRow = row + direction;
        if (newRow >= 0 && newRow < 8 && !this.board[newRow][col]) {
            validMoves.push({ row: newRow, col });
        }
        for (const deltaCol of [-1, 1]) {
            const newCol = col + deltaCol;
            if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                if (!this.board[newRow][newCol]) {
                    validMoves.push({ row: newRow, col: newCol });
                }
            }
        }
        return validMoves;
    }

    makeMove(fromRow, fromCol, toRow, toCol) {
        if (!this.isValidMove(fromRow, fromCol, toRow, toCol)) {
            return { error: \"Invalid move\" };
        }

        const piece = this.board[fromRow][fromCol];
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        let pointsScored = 0;
        
        let wasPromotionChoice = false;

        if (this.checkPromotion(toRow, toCol)) {
            const promotionPoints = this.processPromotion(toRow, toCol);
            if (promotionPoints > 0) {
                pointsScored += promotionPoints;
            } else if (this.gameState === 'choosing_promotion') {
                wasPromotionChoice = true;
            }
        }

        if (!wasPromotionChoice) {
            const combinations = this.checkCombinationsAroundPosition(toRow, toCol);
            if (combinations.length > 0) {
                pointsScored += this.processCombinations(combinations);
            }

            if (pointsScored > 0) {
                if (this.currentPlayer === 'white') this.whiteScore += pointsScored;
                else this.blackScore += pointsScored;
            }
            
            this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        }

        this.selectedPiece = null;
        this.selectedPosition = null;
        
        this.checkGameEnd();
        this.saveGameState();

        if (wasPromotionChoice) return { needsPromotionChoice: true };

        return { success: true };
    }

    isValidMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        if (!piece || piece.color !== this.currentPlayer) return false;
        if (this.board[toRow][toCol]) return false;
        const validMoves = this.getValidMoves(fromRow, fromCol);
        return validMoves.some(move => move.row === toRow && move.col === toCol);
    }

    checkPromotion(row, col) {
        const piece = this.board[row][col];
        if (!piece || piece.promoted) return false;
        if ((piece.color === 'white' && row === 0) || (piece.color === 'black' && row === 7)) {
            piece.promoted = true;
            return true;
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
                    matchingPieces.push({ row: r, col: c, piece: targetPiece });
                }
            }
        }
        if (matchingPieces.length === 0) return 0;
        if (matchingPieces.length === 1) {
            this.board[matchingPieces[0].row][matchingPieces[0].col] = null;
            return piece.number;
        } else {
            this.showPromotionChoice(matchingPieces, piece.number);
            return 0;
        }
    }

    showPromotionChoice(matchingPieces, promotedNumber) {
        this.gameState = 'choosing_promotion';
        this.promotionChoices = matchingPieces;
        this.promotionPoints = promotedNumber;
    }

    handlePromotionChoice(row, col) {
        if (this.gameState !== 'choosing_promotion') return { error: 'Not in promotion choice state' };
        
        const chosenPiece = this.promotionChoices.find(p => p.row === row && p.col === col);
        if (!chosenPiece) return { error: 'Invalid promotion choice' };
        
        this.board[row][col] = null;
        if (this.currentPlayer === 'white') {
            this.whiteScore += this.promotionPoints;
        } else {
            this.blackScore += this.promotionPoints;
        }

        this.gameState = 'playing';
        this.promotionChoices = null;
        this.promotionPoints = 0;
        
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        this.checkGameEnd();
        this.saveGameState();
        return { success: true };
    }

    checkCombinationsAroundPosition(centerRow, centerCol) {
        const radius = 3;
        const nearbyPieces = [];
        for (let row = Math.max(0, centerRow - radius); row <= Math.min(7, centerRow + radius); row++) {
            for (let col = Math.max(0, centerCol - radius); col <= Math.min(7, centerCol + radius); col++) {
                if (this.board[row][col]) {
                    nearbyPieces.push({ row, col, piece: this.board[row][col] });
                }
            }
        }
        return this.findValidCombinations(nearbyPieces);
    }

    findValidCombinations(pieces) {
        const validCombinations = [];
        const n = pieces.length;
        for (let mask = 3; mask < (1 << n); mask++) {
            const combination = [];
            let sum = 0, hasWhite = false, hasBlack = false;
            for (let i = 0; i < n; i++) {
                if (mask & (1 << i)) {
                    const piece = pieces[i];
                    combination.push(piece);
                    sum += piece.piece.number;
                    if (piece.piece.color === 'white') hasWhite = true; else hasBlack = true;
                }
            }
            if (sum === 10 && hasWhite && hasBlack && combination.length <= 8 && this.areConnectedOptimized(combination)) {
                validCombinations.push(combination);
            }
        }
        return validCombinations;
    }

    areConnectedOptimized(pieces) {
        if (pieces.length <= 1) return true;
        const positionSet = new Set(pieces.map(p => `${p.row},${p.col}`));
        const visited = new Set();
        const queue = [pieces[0]];
        visited.add(`${pieces[0].row},${pieces[0].col}`);
        const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        while (queue.length > 0) {
            const current = queue.shift();
            for (const [dr, dc] of directions) {
                const newRow = current.row + dr, newCol = current.col + dc;
                const key = `${newRow},${newCol}`;
                if (positionSet.has(key) && !visited.has(key)) {
                    visited.add(key);
                    queue.push({ row: newRow, col: newCol });
                }
            }
        }
        return visited.size === pieces.length;
    }

    processCombinations(combinations) {
        let points = 0;
        const piecesToRemove = new Set();
        for (const combo of combinations) {
            for (const pos of combo) {
                if (pos.piece.color !== this.currentPlayer && !pos.piece.promoted) {
                    piecesToRemove.add(`${pos.row},${pos.col}`);
                }
            }
        }
        for (const key of piecesToRemove) {
            const [row, col] = key.split(',').map(Number);
            if (this.board[row][col]) {
                points += this.board[row][col].number;
                this.board[row][col] = null;
            }
        }
        return points;
    }

    calculatePromotedPieceValues() {
        let whitePromotedValue = 0, blackPromotedValue = 0;
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.promoted) {
                    if (piece.color === 'white') whitePromotedValue += piece.number;
                    else blackPromotedValue += piece.number;
                }
            }
        }
        return { whitePromotedValue, blackPromotedValue };
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

    checkGameEnd() {
        if (!this.hasValidMoves('white') && !this.hasValidMoves('black')) {
            this.gameOver = true;
        }
    }

    saveGameState() {
        const { whitePromotedValue, blackPromotedValue } = this.calculatePromotedPieceValues();
        const gameState = {
            board: this.board.map(row => row.map(p => p ? { ...p } : null)),
            currentPlayer: this.currentPlayer,
            whiteScore: this.whiteScore,
            blackScore: this.blackScore,
            gameOver: this.gameOver,
            gameState: this.gameState,
            promotionChoices: this.promotionChoices,
            promotionPoints: this.promotionPoints,
            promotedWhiteValue: whitePromotedValue,
            promotedBlackValue: blackPromotedValue,
        };
        this.gameHistory = this.gameHistory.slice(0, this.historyIndex + 1);
        this.gameHistory.push(JSON.parse(JSON.stringify(gameState)));
        this.historyIndex++;
        if (this.gameHistory.length > this.maxHistorySize) {
            this.gameHistory.shift(); this.historyIndex--;
        }
    }

    restoreGameState(historyIndex) {
        if (historyIndex < 0 || historyIndex >= this.gameHistory.length) return;
        
        const stateToRestore = JSON.parse(JSON.stringify(this.gameHistory[historyIndex]));

        this.board = stateToRestore.board;
        this.currentPlayer = stateToRestore.currentPlayer;
        this.whiteScore = stateToRestore.whiteScore;
        this.blackScore = stateToRestore.blackScore;
        this.gameOver = stateToRestore.gameOver;
        this.gameState = stateToRestore.gameState;
        this.promotionChoices = stateToRestore.promotionChoices;
        this.promotionPoints = stateToRestore.promotionPoints;
        
        this.gameHistory = this.gameHistory.slice(0, historyIndex + 1);
        this.historyIndex = historyIndex;
    }
    
    canUndo() { return this.historyIndex > 0; }
    canRedo() { return this.historyIndex < this.gameHistory.length - 1; }

    undo() {
        if (!this.canUndo()) return;
        this.restoreGameState(this.historyIndex - 1);
    }
    redo() {
        if (!this.canRedo()) return;
        this.restoreGameState(this.historyIndex + 1);
    }
}

let games = {}; // Store all active games by roomId
let waitingPlayer = null; // The socket of the player waiting for a match

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // --- Matchmaking Logic ---
    socket.on('findGame', () => {
        console.log(`${socket.id} is looking for a game.`);
        if (waitingPlayer) {
            const player1 = waitingPlayer;
            const player2 = socket;
            
            const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
            
            player1.join(roomId);
            player2.join(roomId);

            games[roomId] = {
                game: new Check10Game(),
                players: [{ id: player1.id, color: 'white' }, { id: player2.id, color: 'black' }],
                roomId: roomId
            };

            waitingPlayer = null;

            console.log(`Match found! Game ${roomId} starting between ${player1.id} and ${player2.id}`);

            const initialGameState = games[roomId].game.gameHistory[0];
            player1.emit('gameStarted', { roomId, color: 'white', gameState: initialGameState });
            player2.emit('gameStarted', { roomId, color: 'black', gameState: initialGameState });

        } else {
            waitingPlayer = socket;
            socket.emit('waiting');
            console.log(`${socket.id} is now waiting for an opponent.`);
        }
    });

    // --- In-Game Action Handlers ---
    socket.on('makeMove', (data) => {
        const { roomId, from, to } = data;
        const gameData = games[roomId];
        if (!gameData) return;

        const player = gameData.players.find(p => p.id === socket.id);
        const game = gameData.game;

        if (player && player.color === game.currentPlayer) {
            const result = game.makeMove(from.row, from.col, to.row, to.col);

            if (result.success || result.needsPromotionChoice) {
                const state = game.gameHistory[game.historyIndex];
                io.to(roomId).emit('gameUpdate', { ...state, lastMove: { from, to }, gameHistory: game.gameHistory, historyIndex: game.historyIndex });
            } else {
                socket.emit('errorMsg', result.error || 'An unknown error occurred.');
            }
        } else {
            socket.emit('errorMsg', \"It's not your turn!\");
        }
    });

    socket.on('promotionChoice', (data) => {
        const { roomId, pos } = data;
        const gameData = games[roomId];
        if(!gameData) return;
        const game = gameData.game;
        
        const result = game.handlePromotionChoice(pos.row, pos.col);
        if(result.success) {
            const state = game.gameHistory[game.historyIndex];
            io.to(roomId).emit('gameUpdate', { ...state, gameHistory: game.gameHistory, historyIndex: game.historyIndex });
        }
    });

    socket.on('undoRequest', (roomId) => {
        const gameData = games[roomId];
        if (gameData && gameData.game.canUndo()) {
            gameData.game.undo();
            const state = gameData.game.gameHistory[gameData.game.historyIndex];
            io.to(roomId).emit('gameUpdate', { ...state, gameHistory: gameData.game.historyIndex > 0 ? gameData.game.gameHistory : [state], historyIndex: gameData.game.historyIndex });
        }
    });

    socket.on('redoRequest', (roomId) => {
        const gameData = games[roomId];
        if (gameData && gameData.game.canRedo()) {
            gameData.game.redo();
            const state = gameData.game.gameHistory[gameData.game.historyIndex];
            io.to(roomId).emit('gameUpdate', { ...state, gameHistory: gameData.game.gameHistory, historyIndex: gameData.game.historyIndex });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
            console.log('The waiting player disconnected. Pool is now empty.');
        }

        for (const roomId in games) {
            const gameData = games[roomId];
            const playerIndex = gameData.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                io.to(roomId).emit('opponentDisconnected');
                delete games[roomId];
                console.log(`Game ${roomId} closed due to disconnect.`);
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});