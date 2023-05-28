import 'express-async-errors';

import { Application, NextFunction, Request, Response, json, urlencoded } from 'express';
import { CustomError, IErrorResponse } from './shared/globals/helpers/error-handler';

import HTTP_STATUS from 'http-status-codes';
import Logger from 'bunyan';
import { Server } from 'socket.io';
import applicationRoutes from './routes';
import compression from 'compression';
import { config } from './config';
import cookierSession from 'cookie-session';
import cors from 'cors';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import helmet from 'helmet';
import hpp from 'hpp';
import http from 'http';

const SERVER_PORT = 5000;
const log: Logger = config.createLogger('server');

export class ChattyServer {
  private app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  private securityMiddleWare(app: Application): void {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    app.use(
      cookierSession({
        name: 'session',
        keys: [config.SECRECT_KEY_ONE!, config.SECRECT_KEY_TWO!],
        maxAge: SEVEN_DAYS,
        secure: config.NODE_ENV !== 'development'
      })
    );
    app.use(hpp());
    app.use(helmet());
    app.use(
      cors({
        origin: config.CLIENT_URL,
        credentials: true,
        optionsSuccessStatus: 200,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
      })
    );
  }

  private standardMiddleWare(app: Application): void {
    app.use(compression());
    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ extended: true, limit: '50mb' }));
  }

  private routeMiddleWare(app: Application): void {
    applicationRoutes(app);
  }
  private globalErrorHandler(app: Application): void {
    app.all('*', (req: Request, res: Response) => {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: `${req.originalUrl} not found` });
    });
    app.use((error: IErrorResponse, _req: Request, res: Response, next: NextFunction) => {
      log.error(error);
      if (error instanceof CustomError) {
        return res.status(error.statusCode).json(error.serializeErrors());
      }
      next();
    });
  }
  private async startServer(app: Application): Promise<void> {
    try {
      const httpServer: http.Server = new http.Server(app);
      const socketIO: Server = await this.createSocketIO(httpServer);
      this.startHttpServer(httpServer);
      this.socketIOConnections(socketIO);
    } catch (error) {
      log.error(error);
    }
  }
  private async createSocketIO(httpServer: http.Server): Promise<Server> {
    const io: Server = new Server(httpServer, {
      cors: {
        origin: config.CLIENT_URL,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
      }
    });
    const pubClient = createClient({ url: config.REDIS_HOST });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    return io;
  }
  private startHttpServer(httpServer: http.Server): void {
    log.info(`Server has started with process ${process.pid}`);
    httpServer.listen(SERVER_PORT, () => {
      log.info(`Server running on port ${SERVER_PORT}`);
    });
  }
  public start(): void {
    const app = this.app;
    this.securityMiddleWare(app);
    this.standardMiddleWare(app);
    this.routeMiddleWare(app);
    this.globalErrorHandler(app);
    this.startServer(app);
  }

  private socketIOConnections(io: Server): void {}
}

export default ChattyServer;
