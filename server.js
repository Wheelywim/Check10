const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// --- Main Game Logic Class (Unchanged) ---
class Check10Game {
    constructor() { this.board = []; this.currentPlayer = 'white'; this.whiteScore = 0; this.blackScore = 0; this.gameOver = false; this.gameState = 'playing'; this.promotionChoices = null; this.promotionPoints = 0; this.gameHistory = []; this.historyIndex = -1; this.maxHistorySize = 50; this.lastMessage = "White player starts!"; this.initializeBoard(); this.saveGameState(); }
    initializeBoard() { this.board = Array(8).fill(null).map(() => Array(8).fill(null)); const r1 = [8, 7, 6, 5, 4, 3, 2, 1], r2 = [1, 2, 3, 4, 5, 6, 7, 8]; for (let c = 0; c < 8; c++) { this.board[0][c] = { color: 'black', number: r1[c], promoted: false }; this.board[1][c] = { color: 'black', number: r2[c], promoted: false }; this.board[6][c] = { color: 'white', number: r1[c], promoted: false }; this.board[7][c] = { color: 'white', number: r2[c], promoted: false }; } }
    getValidMoves(r, c) { const v = []; const p = this.board[r][c]; if (!p) return v; const d = p.color === 'white' ? -1 : 1; const nr = r + d; if (nr >= 0 && nr < 8) { if (!this.board[nr][c]) v.push({ row: nr, col: c }); for (const dc of [-1, 1]) { const nc = c + dc; if (nc >= 0 && nc < 8 && !this.board[nr][nc]) v.push({ row: nr, col: nc }); } } return v; }
    isValidMove(fr, fc, tr, tc) { const p = this.board[fr][fc]; if (!p || p.color !== this.currentPlayer || this.board[tr][tc]) return false; return this.getValidMoves(fr, fc).some(m => m.row === tr && m.col === tc); }
    makeMove(fr, fc, tr, tc) { if (!this.isValidMove(fr, fc, tr, tc)) return false; const p = this.board[fr][fc]; this.board[tr][tc] = p; this.board[fr][fc] = null; let pts = 0; if (this.checkPromotion(tr, tc)) { const promoPts = this.processPromotion(tr, tc); if (promoPts > 0) pts += promoPts; else if (this.gameState === 'choosing_promotion') { this.saveGameState(); return true; } } const combos = this.checkCombinationsAroundPosition(tr, tc); if (combos.length > 0) pts += this.processCombinations(combos); if (pts > 0) { if (this.currentPlayer === 'white') this.whiteScore += pts; else this.blackScore += pts; this.lastMessage = `${this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1)} scored ${pts} points!`; } else { this.lastMessage = `${this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1)} moved ${p.number}.`; } this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white'; this.checkGameEnd(); this.saveGameState(); return true; }
    handlePromotionChoice(r, c) { if (this.gameState !== 'choosing_promotion') return false; const choice = this.promotionChoices.find(p => p.row === r && p.col === c); if (!choice) { this.lastMessage = `Please click on one of the highlighted pieces.`; return false; } const player = this.currentPlayer; this.board[r][c] = null; const pts = this.promotionPoints; if (player === 'white') this.whiteScore += pts; else this.blackScore += pts; this.gameState = 'playing'; this.promotionChoices = null; this.promotionPoints = 0; this.lastMessage = `${player.charAt(0).toUpperCase() + player.slice(1)} promoted and scored ${pts} points!`; this.currentPlayer = (player === 'white' ? 'black' : 'white'); this.checkGameEnd(); this.saveGameState(); return true; }
    checkPromotion(r, c) { const p = this.board[r][c]; if (!p) return false; if ((p.color === 'white' && r === 0) || (p.color === 'black' && r === 7)) { p.promoted = true; return true; } return false; }
    processPromotion(r, c) { const p = this.board[r][c]; const oppColor = p.color === 'white' ? 'black' : 'white'; const matches = []; for (let ro = 0; ro < 8; ro++) { for (let co = 0; co < 8; co++) { const tp = this.board[ro][co]; if (tp && tp.color === oppColor && tp.number === p.number && !tp.promoted) matches.push({ row: ro, col: co, piece: tp }); } } if (matches.length === 0) return 0; if (matches.length === 1) { this.board[matches[0].row][matches[0].col] = null; return p.number; } else { this.showPromotionChoice(matches, p.number); return 0; } }
    showPromotionChoice(m, n) { this.gameState = 'choosing_promotion'; this.promotionChoices = m; this.promotionPoints = n; this.lastMessage = `Promotion! Choose which opponent piece to remove.`; }
    checkCombinationsAroundPosition(cr, cc) { const rad = 3, nearby = []; for (let r = Math.max(0, cr - rad); r <= Math.min(7, cr + rad); r++) { for (let c = Math.max(0, cc - rad); c <= Math.min(7, cc + rad); c++) { if (this.board[r][c]) nearby.push({ row: r, col: c, piece: this.board[r][c] }); } } return this.findValidCombinations(nearby); }
    findValidCombinations(ps) { const combos = []; const n = ps.length; for (let mask = 3; mask < (1 << n); mask++) { const combo = []; let sum = 0, hasW = false, hasB = false; for (let i = 0; i < n; i++) { if (mask & (1 << i)) { const p = ps[i]; combo.push(p); sum += p.piece.number; if (p.piece.color === 'white') hasW = true; else hasB = true; } } if (sum === 10 && hasW && hasB && combo.length <= 8 && this.areConnectedOptimized(combo)) combos.push(combo); } return combos; }
    areConnectedOptimized(ps) { if (ps.length <= 1) return true; const posSet = new Set(ps.map(p => `${p.row},${p.col}`)); const visited = new Set(); const q = [ps[0]]; visited.add(`${ps[0].row},${ps[0].col}`); const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]; while (q.length > 0) { const curr = q.shift(); for (const [dr, dc] of dirs) { const nr = curr.row + dr, nc = curr.col + dc; const key = `${nr},${nc}`; if (posSet.has(key) && !visited.has(key)) { visited.add(key); q.push({ row: nr, col: nc }); } } } return visited.size === ps.length; }
    processCombinations(combos) { let pts = 0; const toRemove = new Set(); for (const combo of combos) { for (const pos of combo) { if (pos.piece.color !== this.currentPlayer && !pos.piece.promoted) toRemove.add(`${pos.row},${pos.col}`); } } for (const key of toRemove) { const [r, c] = key.split(',').map(Number); if (this.board[r][c]) { pts += this.board[r][c].number; this.board[r][c] = null; } } return pts; }
    calculatePromotedPieceValues() { let wVal = 0, bVal = 0; for (let r = 0; r < 8; r++) { for (let c = 0; c < 8; c++) { const p = this.board[r][c]; if (p && p.promoted) { if (p.color === 'white') wVal += p.number; else bVal += p.number; } } } return { whitePromotedValue: wVal, blackPromotedValue: bVal }; }
    hasValidMoves(player) { for (let r = 0; r < 8; r++) { for (let c = 0; c < 8; c++) { if (this.board[r][c] && this.board[r][c].color === player && this.getValidMoves(r, c).length > 0) return true; } } return false; }
    checkGameEnd() { if (this.hasValidMoves(this.currentPlayer)) return false; this.gameOver = true; const pVals = this.calculatePromotedPieceValues(); const fws = this.whiteScore + pVals.whitePromotedValue, fbs = this.blackScore + pVals.blackPromotedValue; const winner = fws > fbs ? 'White' : fbs > fws ? 'Black' : 'Tie'; if (winner === 'Tie') this.lastMessage = `Game Over! It's a tie! Both scored ${fws}.`; else { const ws = winner === 'White' ? fws : fbs, ls = winner === 'White' ? fbs : fws; this.lastMessage = `Game Over! ${winner} wins ${ws} to ${ls}.`; } this.whiteScore = fws; this.blackScore = fbs; return true; }
    saveGameState() { const state = { board: this.board.map(r => r.map(p => p ? { ...p } : null)), currentPlayer: this.currentPlayer, whiteScore: this.whiteScore, blackScore: this.blackScore, gameOver: this.gameOver, gameState: this.gameState, promotionChoices: this.promotionChoices, lastMessage: this.lastMessage }; this.gameHistory = this.gameHistory.slice(0, this.historyIndex + 1); this.gameHistory.push(state); this.historyIndex++; if (this.gameHistory.length > this.maxHistorySize) { this.gameHistory.shift(); this.historyIndex--; } }
    restoreGameState(state) { this.board = state.board.map(r => r.map(p => p ? { ...p } : null)); this.currentPlayer = state.currentPlayer; this.whiteScore = state.whiteScore; this.blackScore = state.blackScore; this.gameOver = state.gameOver; this.gameState = 'playing'; this.promotionChoices = null; this.promotionPoints = 0; this.lastMessage = state.lastMessage; }
    canUndo() { return this.historyIndex > 0; }
    canRedo() { return this.historyIndex < this.gameHistory.length - 1; }
    undo() { if (this.canUndo()) { this.historyIndex--; this.restoreGameState(this.gameHistory[this.historyIndex]); this.lastMessage = "Move undone."; } }
    redo() { if (this.canRedo()) { this.historyIndex++; this.restoreGameState(this.gameHistory[this.historyIndex]); this.lastMessage = "Move redone."; } }
}

const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg' };
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    fs.readFile(filePath, (error, content) => {
        if (error) { if (error.code == 'ENOENT') { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<h1>404 Not Found</h1>', 'utf-8'); } else { res.writeHead(500); res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n'); } } else { res.writeHead(200, { 'Content-Type': contentType }); res.end(content); }
    });
});

const wss = new WebSocket.Server({ server });
let rooms = {}; let waitingPlayer = null; let nextRoomId = 1;

wss.on('connection', ws => {
    console.log('Client connected');
    ws.on('message', message => {
        const data = JSON.parse(message);
        
        if (data.type === 'setNickname') {
            ws.nickname = data.name.trim() || 'Anonymous'; // Set default if name is empty
            if (waitingPlayer) {
                const roomId = nextRoomId++;
                const room = { game: new Check10Game(), playerWhite: waitingPlayer, playerBlack: ws, playAgain: new Set() };
                rooms[roomId] = room;
                waitingPlayer.roomId = roomId; waitingPlayer.playerColor = 'white';
                ws.roomId = roomId; ws.playerColor = 'black';
                waitingPlayer = null;
                const nicknames = { white: room.playerWhite.nickname, black: room.playerBlack.nickname };
                const initialGameState = room.game.gameHistory[room.game.historyIndex];
                console.log(`Pair found: ${nicknames.white} vs ${nicknames.black}. Starting game in room ${roomId}.`);
                room.playerWhite.send(JSON.stringify({ type: 'gameStart', playerColor: 'white', gameState: initialGameState, nicknames: nicknames }));
                room.playerBlack.send(JSON.stringify({ type: 'gameStart', playerColor: 'black', gameState: initialGameState, nicknames: nicknames }));
            } else {
                waitingPlayer = ws;
                ws.send(JSON.stringify({ type: 'waiting' }));
            }
            return;
        }

        const room = rooms[ws.roomId]; if (!room) return;
        const game = room.game; let lastMove = null;

        const turnIndependentActions = ['chat', 'resign', 'playAgainRequest', 'newGameRequest', 'undoRequest', 'redoRequest'];
        if (!turnIndependentActions.includes(data.type) && game.currentPlayer !== ws.playerColor) { return; }

        switch (data.type) {
            case 'move': if (game.makeMove(data.from.row, data.from.col, data.to.row, data.to.col)) { lastMove = { from: data.from, to: data.to }; } break;
            case 'promotionChoice': if (game.handlePromotionChoice(data.pos.row, data.pos.col)) { lastMove = { from: data.pos, to: null }; } break;
            case 'chat': const opponent = ws.playerColor === 'white' ? room.playerBlack : room.playerWhite; if (opponent && opponent.readyState === WebSocket.OPEN) { opponent.send(JSON.stringify({ type: 'chat', message: data.message })); } return;
            case 'undoRequest': game.undo(); break;
            case 'redoRequest': game.redo(); break;
            case 'resign':
                const winnerNick = (ws.playerColor === 'white' ? room.playerBlack.nickname : room.playerWhite.nickname);
                game.gameOver = true;
                game.lastMessage = `${ws.nickname} resigned. ${winnerNick} wins.`;
                break;
            case 'playAgainRequest':
                if (!room.game.gameOver) return;
                room.playAgain.add(ws.playerColor);
                if (room.playAgain.size === 2) {
                    console.log(`Room ${ws.roomId}: Rematch started.`);
                    const oldWhite = room.playerWhite;
                    room.playerWhite = room.playerBlack; room.playerBlack = oldWhite;
                    room.playerWhite.playerColor = 'white'; room.playerBlack.playerColor = 'black';
                    room.game = new Check10Game(); room.playAgain.clear();
                    const nicknames = { white: room.playerWhite.nickname, black: room.playerBlack.nickname };
                    const initialGameState = room.game.gameHistory[room.game.historyIndex];
                    room.playerWhite.send(JSON.stringify({ type: 'gameStart', playerColor: 'white', gameState: initialGameState, nicknames: nicknames }));
                    room.playerBlack.send(JSON.stringify({ type: 'gameStart', playerColor: 'black', gameState: initialGameState, nicknames: nicknames }));
                } else {
                    const opponent = ws.playerColor === 'white' ? room.playerBlack : room.playerWhite;
                    if (opponent && opponent.readyState === WebSocket.OPEN) {
                        opponent.send(JSON.stringify({ type: 'opponentWantsRematch' }));
                    }
                }
                return;
        }
        broadcastGameState(ws.roomId, lastMove);
    });
    ws.on('close', () => {
        const roomId = ws.roomId;
        if (waitingPlayer === ws) { waitingPlayer = null; console.log('Waiting player disconnected.'); return; }
        const room = rooms[roomId];
        if (room) { console.log(`Client ${ws.nickname} from room ${roomId} disconnected.`); const otherPlayer = ws.playerColor === 'white' ? room.playerBlack : room.playerWhite; if (otherPlayer && otherPlayer.readyState === WebSocket.OPEN) { otherPlayer.send(JSON.stringify({ type: 'opponentDisconnect' })); } delete rooms[roomId]; }
    });
});

function broadcastGameState(roomId, lastMove = null) {
    const room = rooms[roomId]; if (!room || !room.game) return;
    const game = room.game;
    const nicknames = { white: room.playerWhite.nickname, black: room.playerBlack.nickname };
    const gameState = { ...game.gameHistory[game.historyIndex], canUndo: game.canUndo(), canRedo: game.canRedo() };
    const payload = JSON.stringify({ type: 'gameStateUpdate', gameState: gameState, lastMove: lastMove, nicknames: nicknames });
    if (room.playerWhite && room.playerWhite.readyState === WebSocket.OPEN) room.playerWhite.send(payload);
    if (room.playerBlack && room.playerBlack.readyState === WebSocket.OPEN) room.playerBlack.send(payload);
}

server.listen(8080, () => { console.log('HTTP and WebSocket server started on port 8080'); });