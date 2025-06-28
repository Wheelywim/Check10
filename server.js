const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// --- Main Game Logic Class (Un-minified for clarity) ---
class Check10Game {
    constructor() {
        this.board = [];
        this.currentPlayer = 'white';
        this.whiteScore = 0;
        this.blackScore = 0;
        this.gameOver = false;
        this.gameState = 'playing'; // 'playing' or 'choosing_promotion'
        this.promotionChoices = null;
        this.promotionPoints = 0;
        this.gameHistory = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;
        this.lastMessage = "White player starts!";

        this.initializeBoard();
        this.saveGameState();
    }

    initializeBoard() {
        this.board = Array(8).fill(null).map(() => Array(8).fill(null));
        const rowTemplate = [8, 7, 6, 5, 4, 3, 2, 1];
        const rowTemplate2 = [1, 2, 3, 4, 5, 6, 7, 8];
        for (let col = 0; col < 8; col++) {
            this.board[0][col] = { color: 'black', number: rowTemplate[col], promoted: false };
            this.board[1][col] = { color: 'black', number: rowTemplate2[col], promoted: false };
            this.board[6][col] = { color: 'white', number: rowTemplate[col], promoted: false };
            this.board[7][col] = { color: 'white', number: rowTemplate2[col], promoted: false };
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
            if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8 && !this.board[newRow][newCol]) {
                validMoves.push({ row: newRow, col: newCol });
            }
        }
        return validMoves;
    }

    isValidMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        if (!piece || piece.color !== this.currentPlayer) return false;
        if (this.board[toRow][toCol]) return false;
        const validMoves = this.getValidMoves(fromRow, fromCol);
        return validMoves.some(move => move.row === toRow && move.col === toCol);
    }

    makeMove(fromRow, fromCol, toRow, toCol) {
        if (!this.isValidMove(fromRow, fromCol, toRow, toCol)) return false;

        const piece = this.board[fromRow][fromCol];
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        let pointsScored = 0;

        if (this.checkPromotion(toRow, toCol)) {
            // Promotions are now handled via return values, but the logic inside makeMove remains simple
            const promotionResult = this.processPromotion(toRow, toCol);
            if (promotionResult.points > 0) {
                pointsScored += promotionResult.points;
            } else if (this.gameState === 'choosing_promotion') {
                this.saveGameState(); // Save state while waiting for choice
                return true;
            }
        }
        
        const combinations = this.checkCombinationsAroundPosition(toRow, toCol);
        if (combinations.length > 0) {
            const combinationResult = this.processCombinations(combinations);
            pointsScored += combinationResult.points;
        }

        if (pointsScored > 0) {
            if (this.currentPlayer === 'white') this.whiteScore += pointsScored;
            else this.blackScore += pointsScored;
            this.lastMessage = `${this.currentPlayer} scored ${pointsScored} points!`;
        } else {
            this.lastMessage = `${this.currentPlayer} moved ${piece.number}.`;
        }

        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        this.checkGameEnd();
        this.saveGameState();
        return true;
    }

    handlePromotionChoice(row, col) {
        if (this.gameState !== 'choosing_promotion') return false;

        const chosenPieceData = this.promotionChoices.find(p => p.row === row && p.col === col);
        if (!chosenPieceData) {
            this.lastMessage = `Please click on one of the highlighted pieces.`;
            return { success: false, removed: [] };
        }

        const promotingPlayer = this.currentPlayer;
        const removedPos = { row, col };

        this.board[row][col] = null;

        const scoredPoints = this.promotionPoints;
        if (promotingPlayer === 'white') {
            this.whiteScore += scoredPoints;
        } else {
            this.blackScore += scoredPoints;
        }

        this.gameState = 'playing';
        this.promotionChoices = null;
        this.promotionPoints = 0;
        this.lastMessage = `${promotingPlayer} promoted and scored ${scoredPoints} points!`;
        this.currentPlayer = (promotingPlayer === 'white' ? 'black' : 'white');

        this.checkGameEnd();
        this.saveGameState();
        return { success: true, removed: [removedPos] };
    }

    checkPromotion(row, col) { const piece = this.board[row][col]; if (!piece) return false; if ((piece.color === 'white' && row === 0) || (piece.color === 'black' && row === 7)) { piece.promoted = true; return true; } return false; }
    
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
        if (matchingPieces.length === 0) {
            return { points: 0, removed: [] };
        }
        if (matchingPieces.length === 1) {
            const removedPos = { row: matchingPieces[0].row, col: matchingPieces[0].col };
            this.board[removedPos.row][removedPos.col] = null;
            return { points: piece.number, removed: [removedPos] };
        } else {
            this.showPromotionChoice(matchingPieces, piece.number);
            return { points: 0, removed: [] };
        }
    }
    
    showPromotionChoice(matchingPieces, promotedNumber) { this.gameState = 'choosing_promotion'; this.promotionChoices = matchingPieces; this.promotionPoints = promotedNumber; this.lastMessage = `Promotion! Choose which opponent ${promotedNumber} to remove.`; }
    checkCombinationsAroundPosition(centerRow, centerCol) { const radius = 3; const nearbyPieces = []; for (let row = Math.max(0, centerRow - radius); row <= Math.min(7, centerRow + radius); row++) { for (let col = Math.max(0, centerCol - radius); col <= Math.min(7, centerCol + radius); col++) { if (this.board[row][col]) { nearbyPieces.push({ row, col, piece: this.board[row][col] }); } } } return this.findValidCombinations(nearbyPieces); }
    findValidCombinations(pieces) { const validCombinations = []; const n = pieces.length; for (let mask = 3; mask < (1 << n); mask++) { const combination = []; let sum = 0, hasWhite = false, hasBlack = false; for (let i = 0; i < n; i++) { if (mask & (1 << i)) { const piece = pieces[i]; combination.push(piece); sum += piece.piece.number; if (piece.piece.color === 'white') hasWhite = true; else hasBlack = true; } } if (sum === 10 && hasWhite && hasBlack && combination.length <= 8 && this.areConnectedOptimized(combination)) { validCombinations.push(combination); } } return validCombinations; }
    areConnectedOptimized(pieces) { if (pieces.length <= 1) return true; const positionSet = new Set(pieces.map(p => `${p.row},${p.col}`)); const visited = new Set(); const queue = [pieces[0]]; visited.add(`${pieces[0].row},${pieces[0].col}`); const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]; while (queue.length > 0) { const current = queue.shift(); for (const [dr, dc] of directions) { const newRow = current.row + dr, newCol = current.col + dc; const key = `${newRow},${newCol}`; if (positionSet.has(key) && !visited.has(key)) { visited.add(key); queue.push({ row: newRow, col: newCol }); } } } return visited.size === pieces.length; }
    
    processCombinations(combinations) {
        let points = 0;
        const piecesToRemove = new Set();
        const removedCoords = [];
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
                removedCoords.push({ row, col });
            }
        }
        return { points, removed: removedCoords };
    }
    
    calculatePromotedPieceValues() { let whitePromotedValue = 0, blackPromotedValue = 0; for (let row = 0; row < 8; row++) { for (let col = 0; col < 8; col++) { const piece = this.board[row][col]; if (piece && piece.promoted) { if (piece.color === 'white') whitePromotedValue += piece.number; else blackPromotedValue += piece.number; } } } return { whitePromotedValue, blackPromotedValue }; }
    hasValidMoves(player) { for (let row = 0; row < 8; row++) { for (let col = 0; col < 8; col++) { if (this.board[row][col] && this.board[row][col].color === player) { if (this.getValidMoves(row, col).length > 0) return true; } } } return false; }
    checkGameEnd() { if (!this.hasValidMoves(this.currentPlayer)) { this.gameOver = true; const promotedValues = this.calculatePromotedPieceValues(); const finalWhiteScore = this.whiteScore + promotedValues.whitePromotedValue; const finalBlackScore = this.blackScore + promotedValues.blackPromotedValue; const winner = finalWhiteScore > finalBlackScore ? 'White' : finalBlackScore > finalWhiteScore ? 'Black' : 'Tie'; if (winner === 'Tie') { this.lastMessage = `Game Over! It's a tie! Both scored ${finalWhiteScore}.`; } else { const winnerScore = winner === 'White' ? finalWhiteScore : finalBlackScore; const loserScore = winner === 'White' ? finalBlackScore : finalWhiteScore; this.lastMessage = `Game Over! ${winner} wins ${winnerScore} to ${loserScore}.`; } this.whiteScore = finalWhiteScore; this.blackScore = finalBlackScore; return true; } return false; }
    saveGameState() { const gameState = { board: this.board.map(row => row.map(p => p ? { ...p } : null)), currentPlayer: this.currentPlayer, whiteScore: this.whiteScore, blackScore: this.blackScore, gameOver: this.gameOver, gameState: this.gameState, promotionChoices: this.promotionChoices, lastMessage: this.lastMessage }; this.gameHistory = this.gameHistory.slice(0, this.historyIndex + 1); this.gameHistory.push(gameState); this.historyIndex++; if (this.gameHistory.length > this.maxHistorySize) { this.gameHistory.shift(); this.historyIndex--; } }
    restoreGameState(gameState) { this.board = gameState.board.map(row => row.map(p => p ? { ...p } : null)); this.currentPlayer = gameState.currentPlayer; this.whiteScore = gameState.whiteScore; this.blackScore = gameState.blackScore; this.gameOver = gameState.gameOver; this.gameState = 'playing'; this.promotionChoices = null; this.promotionPoints = 0; this.lastMessage = gameState.lastMessage; }
    canUndo() { return this.historyIndex > 0; }
    canRedo() { return this.historyIndex < this.gameHistory.length - 1; }
    undo() { if (this.canUndo()) { this.historyIndex--; this.restoreGameState(this.gameHistory[this.historyIndex]); this.lastMessage = "Move undone."; } }
    redo() { if (this.canRedo()) { this.historyIndex++; this.restoreGameState(this.gameHistory[this.historyIndex]); this.lastMessage = "Move redone."; } }
}


// --- HTTP Server and WebSocket Server ---
const server = http.createServer((req, res) => {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end('Error loading index.html');
            return;
        }
        res.writeHead(200);
        res.end(data);
    });
});
const wss = new WebSocket.Server({ server });
let rooms = {}; let waitingPlayer = null; let nextRoomId = 1;

wss.on('connection', ws => {
    console.log('Client connected'); let playerColor; let roomId;
    if (waitingPlayer) {
        roomId = waitingPlayer.roomId; const room = rooms[roomId]; room.playerBlack = ws; playerColor = 'black'; ws.playerColor = 'black'; ws.roomId = roomId; console.log(`Player Black joined room ${roomId}. Starting game.`); waitingPlayer = null; const initialGameState = room.game.gameHistory[room.game.historyIndex];
        room.playerWhite.send(JSON.stringify({ type: 'gameStart', playerColor: 'white', gameState: initialGameState }));
        room.playerBlack.send(JSON.stringify({ type: 'gameStart', playerColor: 'black', gameState: initialGameState }));
    } else {
        roomId = nextRoomId++; playerColor = 'white'; ws.playerColor = 'white'; ws.roomId = roomId; const game = new Check10Game(); rooms[roomId] = { game: game, playerWhite: ws, playerBlack: null }; waitingPlayer = ws; console.log(`Player White created room ${roomId}. Waiting for opponent.`);
        ws.send(JSON.stringify({ type: 'waiting' }));
    }
    ws.on('message', message => {
        const data = JSON.parse(message); const room = rooms[ws.roomId]; if (!room) return; const game = room.game; let lastMove = null;
        let removedPieces = []; // To store coordinates of pieces removed in a turn

        if (data.type !== 'newGameRequest' && game.currentPlayer !== ws.playerColor && game.gameState !== 'choosing_promotion') { return; }
        
        switch (data.type) {
            case 'move':
                const piecesBefore = new Set();
                for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(game.board[r][c]) piecesBefore.add(`${r},${c}`);

                if (game.makeMove(data.from.row, data.from.col, data.to.row, data.to.col)) {
                    lastMove = { from: data.from, to: data.to };
                    const piecesAfter = new Set();
                    for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(game.board[r][c]) piecesAfter.add(`${r},${c}`);
                    
                    piecesBefore.forEach(posKey => {
                        if (!piecesAfter.has(posKey) && posKey !== `${data.from.row},${data.from.col}`) {
                            const [row, col] = posKey.split(',').map(Number);
                            removedPieces.push({ row, col });
                        }
                    });
                }
                break;
            case 'promotionChoice':
                const result = game.handlePromotionChoice(data.pos.row, data.pos.col);
                if (result.success) {
                    lastMove = { from: data.pos, to: null };
                    removedPieces = result.removed;
                }
                break;
            case 'undoRequest': game.undo(); break;
            case 'redoRequest': game.redo(); break;
            case 'newGameRequest': if (room.playerWhite) room.playerWhite.close(); if (room.playerBlack) room.playerBlack.close(); return;
        }
        broadcastGameState(ws.roomId, lastMove, removedPieces);
    });
    ws.on('close', () => {
        console.log(`Client ${playerColor} from room ${roomId} disconnected.`); const room = rooms[roomId]; if (room) { const otherPlayer = ws.playerColor === 'white' ? room.playerBlack : room.playerWhite; if (otherPlayer && otherPlayer.readyState === WebSocket.OPEN) { otherPlayer.send(JSON.stringify({ type: 'opponentDisconnect' })); } delete rooms[roomId]; if (waitingPlayer && waitingPlayer.roomId === roomId) { waitingPlayer = null; } }
    });
});

function broadcastGameState(roomId, lastMove = null, removedPieces = null) {
    const room = rooms[roomId]; if (!room || !room.game) return; const game = room.game;
    const gameState = { ...game.gameHistory[game.historyIndex], canUndo: game.canUndo(), canRedo: game.canRedo() };
    const payload = JSON.stringify({
        type: 'gameStateUpdate',
        gameState: gameState,
        lastMove: lastMove,
        removedPieces: removedPieces
    });
    if (room.playerWhite && room.playerWhite.readyState === WebSocket.OPEN) room.playerWhite.send(payload);
    if (room.playerBlack && room.playerBlack.readyState === WebSocket.OPEN) room.playerBlack.send(payload);
}

server.listen(8080, () => { console.log('HTTP and WebSocket server started on port 8080'); });