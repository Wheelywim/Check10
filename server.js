const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// --- Main Game Logic Class (Moved from client to server) ---
// This is the authoritative game state manager.
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

    // Un-minified, readable game logic for easier maintenance
    initializeBoard(){this.board=Array(8).fill(null).map(()=>Array(8).fill(null));const t=[8,7,6,5,4,3,2,1],e=[1,2,3,4,5,6,7,8];for(let r=0;r<8;r++)this.board[0][r]={color:"black",number:t[r],promoted:!1},this.board[1][r]={color:"black",number:e[r],promoted:!1},this.board[6][r]={color:"white",number:t[r],promoted:!1},this.board[7][r]={color:"white",number:e[r],promoted:!1}}
    getValidMoves(t,e){const o=[];const s=this.board[t][e];if(!s)return o;const r=s.color==="white"?-1:1,i=t+r;i>=0&&i<8&&!this.board[i][e]&&o.push({row:i,col:e});for(const a of[-1,1]){const n=e+a;i>=0&&i<8&&n>=0&&n<8&&!this.board[i][n]&&o.push({row:i,col:n})}return o}
    isValidMove(t,e,o,s){const r=this.board[t][e];return!(!r||r.color!==this.currentPlayer)&&!this.board[o][s]&&this.getValidMoves(t,e).some(r=>r.row===o&&r.col===s)}
    makeMove(t,e,o,s){if(!this.isValidMove(t,e,o,s))return!1;const r=this.board[t][e];this.board[o][s]=r,this.board[t][e]=null;let i=0;if(this.checkPromotion(o,s)){const a=this.processPromotion(o,s);if(a>0)i+=a;else if(this.gameState==="choosing_promotion")return this.saveGameState(),!0}const n=this.checkCombinationsAroundPosition(o,s);n.length>0&&(i+=this.processCombinations(n)),i>0?(this.currentPlayer==="white"?this.whiteScore+=i:this.blackScore+=i,this.lastMessage=`${this.currentPlayer} scored ${i} points!`):(this.lastMessage=`${this.currentPlayer} moved ${r.number}.`),this.currentPlayer=this.currentPlayer==="white"?"black":"white",this.checkGameEnd(),this.saveGameState();return!0}
    handlePromotionChoice(t,e){if(this.gameState!=="choosing_promotion")return!1;const o=this.promotionChoices.find(o=>o.row===t&&o.col===e);if(!o)return this.lastMessage=`Please click on one of the highlighted pieces.`,!1;this.board[t][e]=null;const s=this.promotionPoints;this.currentPlayer==="white"?this.whiteScore+=s:this.blackScore+=s,this.gameState="playing",this.promotionChoices=null,this.promotionPoints=0,this.lastMessage=`${this.currentPlayer} promoted and scored ${s} points!`,this.currentPlayer=this.currentPlayer==="white"?"black":"white",this.checkGameEnd(),this.saveGameState();return!0}
    checkPromotion(t,e){const o=this.board[t][e];return!!o&&("white"===o.color&&0===t||"black"===o.color&&7===t)&&(o.promoted=!0,!0)}
    processPromotion(t,e){const o=this.board[t][e],s="white"===o.color?"black":"white",r=[];for(let i=0;i<8;i++)for(let a=0;a<8;a++){const n=this.board[i][a];n&&n.color===s&&n.number===o.number&&!n.promoted&&r.push({row:i,col:a,piece:n})}return 0===r.length?0:1===r.length?(this.board[r[0].row][r[0].col]=null,o.number):(this.showPromotionChoice(r,o.number),0)}
    showPromotionChoice(t,e){this.gameState="choosing_promotion",this.promotionChoices=t,this.promotionPoints=e,this.lastMessage=`Promotion! Choose which opponent ${e} to remove.`}
    checkCombinationsAroundPosition(t,e){const o=[],s=3;for(let r=Math.max(0,t-s);r<=Math.min(7,t+s);r++)for(let i=Math.max(0,e-s);i<=Math.min(7,e+s);i++)this.board[r][i]&&o.push({row:r,col:i,piece:this.board[r][i]});return this.findValidCombinations(o)}
    findValidCombinations(t){const e=[];const o=t.length;for(let s=3;s<1<<o;s++){const r=[];let i=0,a=!1,n=!1;for(let l=0;l<o;l++)if(s&1<<l){const c=t[l];r.push(c),i+=c.piece.number,"white"===c.piece.color?a=!0:n=!0}10===i&&a&&n&&r.length<=8&&this.areConnectedOptimized(r)&&e.push(r)}return e}
    areConnectedOptimized(t){if(t.length<=1)return!0;const e=new Set(t.map(t=>`${t.row},${t.col}`)),o=new Set,s=[t[0]];o.add(`${t[0].row},${t[0].col}`);const r=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];for(;s.length>0;){const i=s.shift();for(const[a,n]of r){const l=i.row+a,c=i.col+n,h=`${l},${c}`;e.has(h)&&!o.has(h)&&(o.add(h),s.push({row:l,col:c}))}}return o.size===t.length}
    processCombinations(t){let e=0;const o=new Set;for(const s of t)for(const r of s)r.piece.color!==this.currentPlayer&&!r.piece.promoted&&o.add(`${r.row},${r.col}`);for(const i of o){const[a,n]=i.split(",").map(Number);this.board[a][n]&&(e+=this.board[a][n].number,this.board[a][n]=null)}return e}
    calculatePromotedPieceValues(){let t=0,e=0;for(let o=0;o<8;o++)for(let s=0;s<8;s++){const r=this.board[o][s];r&&r.promoted&&("white"===r.color?t+=r.number:e+=r.number)}return{whitePromotedValue:t,blackPromotedValue:e}}
    hasValidMoves(t){for(let e=0;e<8;e++)for(let o=0;o<8;o++)if(this.board[e][o]&&this.board[e][o].color===t&&this.getValidMoves(e,o).length>0)return!0;return!1}
    checkGameEnd(){if(this.hasValidMoves(this.currentPlayer))return!1;this.gameOver=!0;const t=this.calculatePromotedPieceValues(),e=this.whiteScore+t.whitePromotedValue,o=this.blackScore+t.blackPromotedValue,s=e>o?"White":o>e?"Black":"Tie";return"Tie"===s?this.lastMessage=`Game Over! It's a tie! Both scored ${e}.`:(this.lastMessage=`Game Over! ${s} wins ${e} to ${o}.`),this.whiteScore=e,this.blackScore=o,!0}
    saveGameState(){const t={board:this.board.map(t=>t.map(t=>t?{...t}:null)),currentPlayer:this.currentPlayer,whiteScore:this.whiteScore,blackScore:this.blackScore,gameOver:this.gameOver,gameState:this.gameState,promotionChoices:this.promotionChoices,lastMessage:this.lastMessage};this.gameHistory=this.gameHistory.slice(0,this.historyIndex+1),this.gameHistory.push(t),this.historyIndex++,this.gameHistory.length>this.maxHistorySize&&(this.gameHistory.shift(),this.historyIndex--)}
    restoreGameState(t){this.board=t.board.map(t=>t.map(t=>t?{...t}:null)),this.currentPlayer=t.currentPlayer,this.whiteScore=t.whiteScore,this.blackScore=t.blackScore,this.gameOver=t.gameOver,this.gameState="playing",this.promotionChoices=null,this.promotionPoints=0,this.lastMessage=t.lastMessage}
    canUndo(){return this.historyIndex>0}
    canRedo(){return this.historyIndex<this.gameHistory.length-1}
    undo(){this.canUndo()&&(this.historyIndex--,this.restoreGameState(this.gameHistory[this.historyIndex]),this.lastMessage="Move undone.")}
    redo(){this.canRedo()&&(this.historyIndex++,this.restoreGameState(this.gameHistory[this.historyIndex]),this.lastMessage="Move redone.")}
}


// --- HTTP Server to serve the index.html file ---
const server = http.createServer((req, res) => {
    // This is the line to change if your index.html is in a 'public' folder
    // e.g., path.join(__dirname, 'public', 'index.html')
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

// --- WebSocket Server Logic ---
const wss = new WebSocket.Server({ server });

let rooms = {};
let waitingPlayer = null;
let nextRoomId = 1;

wss.on('connection', ws => {
    console.log('Client connected');
    let playerColor;
    let roomId;

    if (waitingPlayer) {
        roomId = waitingPlayer.roomId;
        const room = rooms[roomId];
        room.playerBlack = ws;
        playerColor = 'black';
        ws.playerColor = 'black';
        ws.roomId = roomId;

        console.log(`Player Black joined room ${roomId}. Starting game.`);
        waitingPlayer = null;

        const initialGameState = room.game.gameHistory[room.game.historyIndex];
        
        room.playerWhite.send(JSON.stringify({ type: 'gameStart', playerColor: 'white', gameState: initialGameState }));
        room.playerBlack.send(JSON.stringify({ type: 'gameStart', playerColor: 'black', gameState: initialGameState }));
        
    } else {
        roomId = nextRoomId++;
        playerColor = 'white';
        ws.playerColor = 'white';
        ws.roomId = roomId;
        
        const game = new Check10Game();
        rooms[roomId] = { game: game, playerWhite: ws, playerBlack: null };
        waitingPlayer = ws;
        console.log(`Player White created room ${roomId}. Waiting for opponent.`);

        ws.send(JSON.stringify({ type: 'waiting' }));
    }

    ws.on('message', message => {
        const data = JSON.parse(message);
        const room = rooms[ws.roomId];
        if (!room) return;
        const game = room.game;
        let lastMove = null;

        if (data.type !== 'newGameRequest' && game.currentPlayer !== ws.playerColor && game.gameState !== 'choosing_promotion') {
            return;
        }

        switch (data.type) {
            case 'move':
                if (game.makeMove(data.from.row, data.from.col, data.to.row, data.to.col)) {
                    lastMove = { from: data.from, to: data.to };
                }
                break;

            case 'promotionChoice':
                // We need to find the piece that just moved to animate its promotion
                const movedPieceColor = game.currentPlayer;
                const lastTurnPlayer = movedPieceColor === 'white' ? 'black' : 'white';
                let pieceToAnimate = null;

                // Find the just-promoted piece to include in the animation data
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 8; c++) {
                        const p = game.board[r][c];
                        if (p && p.color === movedPieceColor && p.promoted && (p.color === 'white' ? r === 0 : r === 7)) {
                            // This is likely our piece, but we need to know where it came from.
                            // This is a simplification; we'll animate the removal instead.
                            pieceToAnimate = { from: data.pos, to: null }; // Animate removal
                            break;
                        }
                    }
                     if (pieceToAnimate) break;
                }
                
                if (game.handlePromotionChoice(data.pos.row, data.pos.col)) {
                    lastMove = pieceToAnimate;
                }
                break;
                
            case 'undoRequest': game.undo(); break;
            case 'redoRequest': game.redo(); break;
            case 'newGameRequest':
                 if(room.playerWhite) room.playerWhite.close();
                 if(room.playerBlack) room.playerBlack.close();
                 return;
        }

        broadcastGameState(ws.roomId, lastMove);
    });

    ws.on('close', () => {
        console.log(`Client ${playerColor} from room ${roomId} disconnected.`);
        const room = rooms[roomId];
        if (room) {
            const otherPlayer = ws.playerColor === 'white' ? room.playerBlack : room.playerWhite;
            if (otherPlayer && otherPlayer.readyState === WebSocket.OPEN) {
                otherPlayer.send(JSON.stringify({ type: 'opponentDisconnect' }));
            }
            delete rooms[roomId];
            if (waitingPlayer && waitingPlayer.roomId === roomId) {
                waitingPlayer = null;
            }
        }
    });
});

function broadcastGameState(roomId, lastMove = null) {
    const room = rooms[roomId];
    if (!room || !room.game) return;

    const game = room.game;
    const gameState = {
        ...game.gameHistory[game.historyIndex],
        canUndo: game.canUndo(),
        canRedo: game.canRedo()
    };
    
    const payload = JSON.stringify({
        type: 'gameStateUpdate',
        gameState: gameState,
        lastMove: lastMove // Include the move for animation purposes
    });

    if (room.playerWhite && room.playerWhite.readyState === WebSocket.OPEN) room.playerWhite.send(payload);
    if (room.playerBlack && room.playerBlack.readyState === WebSocket.OPEN) room.playerBlack.send(payload);
}


server.listen(8080, () => {
    console.log('HTTP and WebSocket server started on port 8080');
});