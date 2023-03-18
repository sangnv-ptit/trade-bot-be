import express, { Router, Request, Response } from "express";

const router: Router = express.Router();

interface FormInputs {
  email: string,
  password: string
}

const users = [
  {
    id: 1,
    name: 'Sang Nguyen',
    email: 'test@mail.com',
    password: "123456"
  }
]

router.post('/', (req: Request, res: Response) => {
  const { email, password }:FormInputs = req.body;

  const user = users.find(user => {
    return user.email === email && user.password === password
  });

  if (!user) {
    return res.status(404).send('User Not Found!')
  }

  return res.status(200).json(user)
});

export default router;
