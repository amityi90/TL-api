const Message = require('../models/Message');

exports.submitContactForm = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;

    const newMessage = new Message({
      name,
      email,
      subject,
      message
    });

    await newMessage.save();

    res.status(201).json({
      success: true,
      data: {
        message: 'Message sent successfully'
      }
    });
  } catch (error) {
    next(error);
  }
};
