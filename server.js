const express = require('express')
const path = require('path');
const exphbs = require('express-handlebars');
const mongoose = require('mongoose')
const session = require('express-session');

const app = express()
const HTTP_PORT = process.env.PORT || 8080

app.use(express.static('assets'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// -----------------------------------------
// Config: Session
// -----------------------------------------
app.use(session({
    secret: 'Pui-Chuen',
    resave: false,
    saveUninitialized: true,
}))

// -----------------------------------------
// Config: Handlebars
// -----------------------------------------
app.engine('.hbs', exphbs.engine({ extname: '.hbs' }));
app.set('view engine', '.hbs');

/// -----------------------------------------
// Mongoose : Connecting to database and set up schemas/models
/// -----------------------------------------
const CONNECTION_STRING = 'mongodb+srv://dbUser:zigzyt-gorNaq-wozwu2@cluster0.uj0itkj.mongodb.net/myLibrary?retryWrites=true&w=majority'
mongoose.connect(CONNECTION_STRING);
const db = mongoose.connection;
db.on("error", console.error.bind(console, 'Error: unable to connect database: '));
db.once("open", () => { console.log('Mongo DB connected successfully.'); });

// -----------------------------------------
// Schemas and Model
// -----------------------------------------
const Schema = mongoose.Schema
const bookSchema = new Schema({ _id: mongoose.ObjectId, title: String, author: String, image: String, borrowedBy: String })
const userSchema = new Schema({ _id: mongoose.ObjectId, name: String, LibraryCardNumber: String, PhoneNumber: String })

const Book = mongoose.model("books_collection", bookSchema)
const User = mongoose.model("users_collection", userSchema)

// -----------------------------------------
// Function
// -----------------------------------------
const ensureLogin = (req, res, next) => {

    if (req.session.isLoggedIn !== undefined && req.session.isLoggedIn && req.session.user !== undefined){
        //if user has logged in allow them to go to desired endpoint
        next()
    }else{
        //otherwise, ask them to login first
        res.render("login", { layout: "default-layout", title: "Login", errorMsg: "You have to login first" })
    }
}

// -----------------------------------------
// API
// -----------------------------------------
app.get("/api/book/getAllItem", async (req, res) => {
    try {

        const results = await Book.find().lean().exec()

        // Check if any data exist
        if (results.length === 0) {
            throw Error("No resources found")
        }

        // Send response with array of objects
        res.json(results)

    } catch (err) {
        // Show error and Debug
        console.log(err)
        return res.send(err)
    }
})

app.post("/borrowBook/:id", async (req, res)=>{
    // Ensure login
    if (req.session.isLoggedIn === undefined || !req.session.isLoggedIn || req.session.user === undefined){
        // If user is not logged in
        req.session.redirectURL = "/"
        return res.render("login", { layout: "default-layout", title: "Login", errorMsg: "You have to login first" })
    }
        
    const borrowBookId = req.params.id
    const userLibraryCardNumber = req.session.user.user_LibraryCardNumber
    
    try{
        // Check whether book is borrowed
        // const findResult = await Book.findOne({_id: borrowBookId}).lean().exec()
        const findResult = await Book.findOne({_id: borrowBookId})

        if(findResult === null){
            console.log(`ERROR: Book(${borrowBookId}) not found in database`)
            return res.redirect("/")
        }

        // Update item
        const updatedValue = {
            borrowedBy: userLibraryCardNumber
        }

        // Try update to DB
        const updateResult = await findResult.updateOne(updatedValue)

        if(updateResult !== null){
            return res.redirect("/")
        }else{
            return res.send("Sorry, update failed.")
        }

    }catch(err){
        console.log(err)
    }
})

app.post("/return/:id", ensureLogin, async (req, res)=>{
    const returnId = req.params.id

    // attempt to find and update
    try{
        const findResult = await Book.findOne({_id: returnId})

        if(findResult === null){
            console.log(`ERROR: Book(${returnId}) not found in database`)
            return res.redirect("/profile")
        }

        // Clear borrow
        const updatedValue = {
            borrowedBy: ""
        }

        const updateResult = await findResult.updateOne(updatedValue)
        
        if(updateResult !== null){
            return res.redirect("/profile")
        }else{
            return res.send("Sorry, update failed.")
        }

    }catch(err){
        console.log(err)
    }

})

// -----------------------------------------
// Endpoint
// -----------------------------------------
app.get("/", async (req, res) => {
    req.session.redirectURL = ""
    try {
        // connect to url
        const results = await fetch('http://localhost:8080/api/book/getAllItem')
        // convert response from url to javascript objects
        const bookList = await results.json();

        res.render("home-page", { layout: "default-layout", title: "Home Page", bookList })

    } catch (err) {
        // Show error and Debug
        console.log(err)
        res.send(err)
    }
})

app.get("/login", (req, res) => {
    // Ensure user is not logged in
    if (req.session.isLoggedIn !== undefined && req.session.isLoggedIn && req.session.user !== undefined){
        // If user is logged in
        return res.redirect("/")
    }

    return res.render("login", { layout: "default-layout", title: "Login" })
})

app.post("/login", async (req, res) => {
    // Ensure user is not logged in
    if (req.session.isLoggedIn !== undefined && req.session.isLoggedIn && req.session.user !== undefined){
        // If user is logged in
        return res.redirect("/")
    }

    // Get User Input
    const cardNumberFromUI = req.body.LibraryCardNumber;
    const passwordFromUI = req.body.password;

    // Validate User Input
    //validate the username and password for valid format
    //generate error if any
    if (cardNumberFromUI === undefined || passwordFromUI === undefined ||
        cardNumberFromUI === "" || passwordFromUI === "") {

        //show error is username or password is not provided or retrieved from form
        return res.render("login", { layout: "default-layout", title: "Login", errorMsg: "Missing Credentials"})
    }

    // Get User information from DB by Library Card Number
    const results = await User.findOne({LibraryCardNumber: cardNumberFromUI}).lean().exec()

    // Is User exist?
    if(!results){
        // User Not found
        return res.render("login", { layout: "default-layout", title: "Login", errorMsg: "Invalid Library Card Number or Password!"})
    }

    // User found
    if(results.PhoneNumber.slice(-4) !== passwordFromUI){
        // Password is not correct
        return res.render("login", { layout: "default-layout", title: "Login", errorMsg: "Invalid Library Card Number or Password!"})
    }

    // Password is correct
    // Save any necessary information in session
    req.session.user = {
        user_name : results.name,
        user_LibraryCardNumber : results.LibraryCardNumber,
        user_PhoneNumber : results.PhoneNumber
    }
    req.session.isLoggedIn = true
    req.session.username = results.name

    if(req.session.redirectURL === "/"){
        req.session.redirectURL = ""
        return res.redirect("/")
    }else{
        return res.redirect("/profile")
    }
    
})

app.get("/logout", (req, res) => {
    // Check whether user is logged in
    if (req.session.isLoggedIn !== undefined && req.session.isLoggedIn && req.session.user !== undefined){
        // User has logged in
        req.session.destroy()
        return res.redirect("/")    
    }else{
        // User has not logged in
        res.send("ERROR: No users logged in")
    }
})

app.get("/profile", ensureLogin, async (req, res) => {
    const Name = req.session.user.user_name
    const LibraryCardNumber = req.session.user.user_LibraryCardNumber
    const PhoneNumber = req.session.user.user_PhoneNumber

    // Get user borrowed book
    try{
        const results = await Book.find({borrowedBy: LibraryCardNumber}).lean().exec()

        // If user have not borrowed any book
        if(results.length === 0){
            return res.render("profile", { layout: "default-layout", title: "Profile", Name, LibraryCardNumber, PhoneNumber, msg:"You have no books checked out"})
        }
        
        res.render("profile", { layout: "default-layout", title: "Profile", Name, LibraryCardNumber, PhoneNumber, borrowedBook:results})

    }catch(err){
        console.log(err)
    }
    
})

// -----------------------------------------
//  Start Server
// -----------------------------------------
const onHttpStart = () => {
    console.log(`Express web server running on port: ${HTTP_PORT}`)
    console.log(`Press CTRL+C to exit`)
}
app.listen(HTTP_PORT, onHttpStart)