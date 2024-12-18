import { HawkEvent, HawkNodeJSInitialSettings } from '../types';

import {
  EventContext,
  AffectedUser,
  EncodedIntegrationToken,
  DecodedIntegrationToken,
  EventData,
  NodeJSAddons,
  Json
} from '@hawk.so/types';
import { setJSExceptionHandler } from 'react-native-exception-handler';
import EventPayload from './modules/event';

class UnhandledRejection extends Error {}

let _instance: Catcher;

class Catcher {
  private readonly type: string = 'errors/react-native';

  private readonly token: EncodedIntegrationToken;

  private readonly collectorEndpoint: string;

  private readonly context?: EventContext;

  private readonly beforeSend?: (event: EventData<NodeJSAddons>) => EventData<NodeJSAddons>;

  constructor(settings: HawkNodeJSInitialSettings | string) {
    if (typeof settings === 'string') {
      settings = {
        token: settings,
      } as HawkNodeJSInitialSettings;
    }

    this.token = settings.token;
    this.context = settings.context || undefined;
    this.beforeSend = settings.beforeSend;

    if (!this.token) {
      throw new Error('Integration Token is missed. You can get it on https://hawk.so at Project Settings.');
    }

    try {
      const integrationId = this.getIntegrationId();

      this.collectorEndpoint = settings.collectorEndpoint || `https://${integrationId}.k1.hawk.so/`;

      /**
       * Set global handlers
       */
      if (!settings.disableGlobalErrorsHandling) {
        this.initGlobalHandlers();
      }
    } catch (error) {
      throw new Error('Invalid integration token');
    }
  }

  /**
   * Catcher package version
   */
  private static getVersion(): string {
    // TODO: get version from package.json
    return '1.0.0';
  }

  /**
   * Send test event from client
   */
  public test(): void {
    /**
     * Create a dummy error event
     * Error: Hawk NodeJS Catcher test message
     */
    const fakeEvent = new Error('Hawk NodeJS Catcher test message');

    /**
     * Catch it and send to Hawk
     */
    this.send(fakeEvent);
  }

  /**
   * This method prepares and sends an Error to Hawk
   * User can fire it manually on try-catch
   *
   * @param error - error to catch
   * @param context — event context
   * @param user - User identifier
   */
  public send(error: Error, context?: EventContext, user?: AffectedUser): void {
    /**
     * Compose and send a request to Hawk
     */
    this.formatAndSend(error, context, user);
  }

  /**
   * Returns integration id from integration token
   */
  private getIntegrationId(): string {
    const decodedIntegrationTokenAsString = Buffer
      .from(this.token, 'base64')
      .toString('utf-8');
    const decodedIntegrationToken: DecodedIntegrationToken = JSON.parse(decodedIntegrationTokenAsString);
    const integrationId = decodedIntegrationToken.integrationId;

    if (!integrationId || integrationId === '') {
      throw new Error('Invalid integration token. There is no integration ID.');
    }

    return integrationId;
  }

  /**
   * Define own error handlers
   */
  private initGlobalHandlers(): void {
    setJSExceptionHandler((error, isFatal) => {
      console.log('Error', error, error.stack, isFatal);

      this.sendErrorFormatted({
        catcherType: this.type,
        payload: {
          title: error.name,
        },
        token: this.token,
      })
    }, true);
  };

  /**
   * Format and send an error
   *
   * @param {Error} err - error to send
   * @param {EventContext} context — event context
   * @param {AffectedUser} user - User identifier
   */
  private formatAndSend(err: Error, context?: EventContext, user?: AffectedUser): void {
    const eventPayload = new EventPayload(err);
    let payload: EventData<NodeJSAddons> = {
      title: eventPayload.getTitle(),
      type: eventPayload.getType(),
      backtrace: eventPayload.getBacktrace(),
      user: this.getUser(user),
      context: this.getContext(context),
      catcherVersion: Catcher.getVersion(),
    };

    /**
     * Filter sensitive data
     */
    if (typeof this.beforeSend === 'function') {
      payload = this.beforeSend(payload);
    }

    this.sendErrorFormatted({
      token: this.token,
      catcherType: this.type,
      payload,
    });
  }

  /**
   * Sends formatted EventData<NodeJSAddons> to the Collector
   *
   * @param {EventData<NodeJSAddons>>} eventFormatted - formatted event to send
   */
  private async sendErrorFormatted(eventFormatted: HawkEvent): Promise<void | Response> {
    return fetch(this.collectorEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventFormatted),
    })
      .catch((err: Error) => {
        console.error(`[Hawk] Cannot send an event because of ${err.toString()}`);
      });
  }

  /**
   * Compose User object
   *
   * @param user - User identifier
   */
  private getUser(user?: AffectedUser): AffectedUser|undefined {
    return user;
  }

  /**
   * Compose context object
   *
   * @param context - Any other information to send with event
   */
  private getContext(context?: EventContext): Json {
    const contextMerged = {};

    if (this.context !== undefined) {
      Object.assign(contextMerged, this.context);
    }

    if (context !== undefined) {
      Object.assign(contextMerged, context);
    }

    return contextMerged;
  }
}

/**
 * Wrapper for Hawk NodeJS Catcher
 */
export default class HawkCatcher {
  /**
   * Wrapper for HawkCatcher constructor
   *
   * @param settings - If settings is a string, it means an Integration Token
   */
  public static init(settings: HawkNodeJSInitialSettings | string): void {
    _instance = new Catcher(settings);
  }

  /**
   * Wrapper for HawkCatcher.send() method
   *
   * This method prepares and sends an Error to Hawk
   * User can fire it manually on try-catch
   *
   * @param error - error to catch
   * @param context — event context
   * @param user - User identifier
   */
  public static send(error: Error, context?: EventContext, user?: AffectedUser): void {
    /**
     * If instance is undefined then do nothing
     */
    if (_instance) {
      return _instance.send(error, context, user);
    }
  }
}

export {
  HawkNodeJSInitialSettings
};
