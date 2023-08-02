import express, { Express } from 'express';
import { RemoteSocket, Server, Socket } from 'socket.io';
import { v4 as uuidV4 } from 'uuid';
import http from 'http';

interface Player {
  id: string;
  username: string;
}

interface Room {
  roomId: string;
  players: Player[];
}

interface CallbackError {
    error: boolean;
    message: string;
}

const app: Express = express(); // initialize express

const server = http.createServer(app);

// set port to value received from environment variable or 8080 if null
const port: string | number = process.env.PORT || 8000 

// upgrade http server to websocket server
const io: Server = new Server(server, {
  cors: {
    origin: "*",  // allow connection from any origin
  },
});

const rooms: Map<string, Room> = new Map();

const rooms2: Room[] = [] 

// io.connection
io.on('connection', (socket: Socket) => {
  // socket refers to the client socket that just got connected.
  // each socket is assigned an id
  console.log(socket.id, 'connected');

  socket.on('username', (username: string) => {
    console.log('username:', username);
    socket.data.username = username;
  });

  socket.on('createRoom', async (callback: (roomId: string) => void) => {
    const roomId: string = uuidV4(); // <- 1 create a new uuid
    await socket.join(roomId); // <- 2 make creating user join the room
	 
    // set roomId as a key and roomData including players as value in the map
    // rooms.set(roomId, { // <- 3
    //   roomId,
    //   players: [{ id: socket.id, username: socket.data?.username }]
    // });

    rooms2.push({
        roomId,
        players: [{ id: socket.id, username: socket.data?.username }]
    });

    callback(roomId); // <- 4 respond with roomId to client by calling the callback function from the client
  });

  socket.on('joinRoom', async (args: {roomId: string}, callback: (roomUpdate: Room | CallbackError) => void) => {
    // check if room exists and has a player waiting
    // const room: Room | undefined = rooms.get(args.roomId);
    const room2: Room| undefined = rooms2.find(r => r.roomId == args.roomId);
    let error: boolean = false; 
    let message: string = "";

    if (!room2) { // if room does not exist
        error = true;
        message = 'room does not exist';
    } else if (room2.players.length <= 0) { // if room is empty set appropriate message
        error = true;
        message = 'room is empty';
    } else if (room2.players.length >= 2) { // if room is full
        error = true;
        message = 'room is full'; // set message to 'room is full'
    }

    if (error) {
    // if there's an error, check if the client passed a callback,
    // call the callback (if it exists) with an error object and exit or 
    // just exit if the callback is not given

        if (callback) { // if user passed a callback, call it with an error payload
            callback({
                error,
                message
            });
        }

        return; // exit
    }

    await socket.join(args.roomId); // make the joining client join the room

    // add the joining user's data to the list of players in the room
    // const roomUpdate: Room = {
    //     ...room,
    //     players: [
    //         ...room.players,
    //         { id: socket.id, username: socket.data?.username },
    //     ],
    // };

    // rooms.set(args.roomId, roomUpdate);

    const index = rooms2.findIndex(room => room.roomId === args.roomId);

    rooms2[index].players.push({ id: socket.id, username: socket.data?.username });

    callback(rooms2[index]); // respond to the client with the room details.

    // emit an 'opponentJoined' event to the room to tell the other player that an opponent has joined
    socket.to(args.roomId).emit('opponentJoined', rooms2[index]);

  });

  socket.on('move', (data: {room: string, move: any}) => {
    // emit to all sockets in the room except the emitting socket.
    socket.to(data.room).emit('move', data.move);
  });

  socket.on("disconnect", () => {
    rooms2.forEach((room: Room, index: number) => { // <- 2
      const userInRoom: Player | undefined = room.players.find((player: Player) => player.id === socket.id); // <- 3
  
      if (userInRoom) {
        if (room.players.length < 2) {
          // if there's only 1 player in the room, close it and exit.
          rooms2.splice(index, 1); // remove the room from the array
          return;
        }
  
        socket.to(room.roomId).emit("playerDisconnected", userInRoom); // <- 4
      }
    });
  });
  

  socket.on("closeRoom", async (data: {roomId: string}) => {
    socket.to(data.roomId).emit("closeRoom", data); // <- 1 inform others in the room that the room is closing
  
    io.socketsLeave(data.roomId); // make all sockets in the room leave the room
  
    // find the index of the room to delete
    const index = rooms2.findIndex(room => room.roomId === data.roomId);
  
    if (index !== -1) {
      rooms2.splice(index, 1); // remove the room from the array
    }
  });
  
});

server.listen(port, () => {
  console.log(`listening on *:${port}`);
});
