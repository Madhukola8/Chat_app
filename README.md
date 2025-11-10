# Chat App (React Native + Node.js)

This is a simple real-time chat application that I built using **React Native (Expo)** for the mobile frontend and **Node.js (Express + Socket.IO)** for the backend.  
All the messages are stored in **MongoDB**, and users can chat in real-time with each other.

---

## Features

- User registration and login using JWT authentication  
- Real-time 1:1 chat using Socket.IO  
- Messages get saved in MongoDB database  
- Shows all registered users  
- Last message visible in the user list  
- Online and offline status  
- Typing indicator  
- Message delivery and read status  

## ⚙️ How to Run the Project

### 🖥️ Backend Setup
1. cd server  
2. npm install  
3. Create `.env` file  
4. npm run dev

### 📱 Mobile Setup
1. cd mobile  
2. npm install  
3. npx expo start


##  Folder Structure
Chat_app/
│
├── server/       # Backend code
│   └── server.js
│
└── mobile/       # React Native frontend
    └── App.js

##  How It Works

1. User registers or logs in.
2. Backend verifies JWT token.
3. Users can chat in real-time.
4. Messages are stored in MongoDB.
5. Users see last message in the list.

## 🧠 Tech Stack

Area      | Technology
Frontend  | React Native (Expo) 
Backend   | Node.js + Express 
Database  | MongoDB 
Realtime  | Socket.IO 
 Auth     | JWT 

##  Me

**Madhu Kola**  
This project was created as part of **Internshala Assignment**.  
I learned real-time communication, APIs, and backend integration while building it.



