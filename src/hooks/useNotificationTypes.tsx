import { useEffect } from 'react';

import { StatSigFlags } from '@/types/statsig';
import { groupBy, isEqual } from 'lodash';
import { shallowEqual } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import tw from 'twin.macro';

import { ComplianceStatus } from '@/constants/abacus';
import { ComplianceStates } from '@/constants/compliance';
import { DialogTypes } from '@/constants/dialogs';
import {
  STRING_KEYS,
  STRING_KEY_VALUES,
  type StringGetterFunction,
  type StringKey,
} from '@/constants/localization';
import { PREDICTION_MARKET } from '@/constants/markets';
import {
  CURRENT_SEASON_NUMBER,
  DEFAULT_TOAST_AUTO_CLOSE_MS,
  INCENTIVES_SEASON_NOTIFICATION_ID,
  MEDIAN_REWARDS_AMOUNT,
  MarketLaunchNotificationIds,
  MarketWindDownNotificationIds,
  NotificationDisplayData,
  NotificationType,
  ReleaseUpdateNotificationIds,
  TransferNotificationTypes,
  type NotificationTypeConfig,
} from '@/constants/notifications';
import { AppRoute } from '@/constants/routes';
import { DydxChainAsset } from '@/constants/wallets';

import { useLocalNotifications } from '@/hooks/useLocalNotifications';

import { AssetIcon } from '@/components/AssetIcon';
import { Icon, IconName } from '@/components/Icon';
import { Link } from '@/components/Link';
// eslint-disable-next-line import/no-cycle
import { BlockRewardNotification } from '@/views/notifications/BlockRewardNotification';
import { IncentiveSeasonDistributionNotification } from '@/views/notifications/IncentiveSeasonDistributionNotification';
import { MarketLaunchTrumpwinNotification } from '@/views/notifications/MarketLaunchTrumpwinNotification';
import { OrderCancelNotification } from '@/views/notifications/OrderCancelNotification';
import { OrderStatusNotification } from '@/views/notifications/OrderStatusNotification';
import { TradeNotification } from '@/views/notifications/TradeNotification';
import { TransferStatusNotification } from '@/views/notifications/TransferStatusNotification';

import {
  getLocalCancelOrders,
  getLocalPlaceOrders,
  getSubaccountFills,
  getSubaccountOrders,
} from '@/state/accountSelectors';
import { getSelectedDydxChainId } from '@/state/appSelectors';
import { useAppDispatch, useAppSelector } from '@/state/appTypes';
import { openDialog } from '@/state/dialogs';
import { getAbacusNotifications } from '@/state/notificationsSelectors';
import { getMarketIds } from '@/state/perpetualsSelectors';

import { formatSeconds } from '@/lib/timeUtils';

import { useAccounts } from './useAccounts';
import { useApiState } from './useApiState';
import { useComplianceState } from './useComplianceState';
import { useIncentivesSeason } from './useIncentivesSeason';
import { useQueryChaosLabsIncentives } from './useQueryChaosLabsIncentives';
import { useAllStatsigGateValues } from './useStatsig';
import { useStringGetter } from './useStringGetter';
import { useTokenConfigs } from './useTokenConfigs';
import { useURLConfigs } from './useURLConfigs';

const parseStringParamsForNotification = ({
  stringGetter,
  value,
}: {
  stringGetter: StringGetterFunction;
  value: unknown;
}) => {
  if (STRING_KEY_VALUES[value as StringKey]) {
    return stringGetter({ key: value as string });
  }

  return value as string;
};

export const notificationTypes: NotificationTypeConfig[] = [
  {
    type: NotificationType.AbacusGenerated,
    useTrigger: ({ trigger }) => {
      const stringGetter = useStringGetter();
      const abacusNotifications = useAppSelector(getAbacusNotifications, isEqual);
      const orders = useAppSelector(getSubaccountOrders, shallowEqual) ?? [];
      const ordersById = groupBy(orders, 'id');
      const localPlaceOrders = useAppSelector(getLocalPlaceOrders, shallowEqual);

      useEffect(() => {
        // eslint-disable-next-line no-restricted-syntax
        for (const abacusNotif of abacusNotifications) {
          const [abacusNotificationType = '', id = ''] = abacusNotif.id.split(':');
          const parsedData = abacusNotif.data ? JSON.parse(abacusNotif.data) : {};

          const params = Object.fromEntries(
            Object.entries(parsedData).map(([key, value]) => {
              return [key, parseStringParamsForNotification({ stringGetter, value })];
            })
          );

          switch (abacusNotificationType) {
            case 'order': {
              const order = ordersById[id]?.[0];
              const clientId: number | undefined = order?.clientId ?? undefined;
              const localOrderExists =
                clientId && localPlaceOrders.some((ordr) => ordr.clientId === clientId);

              if (localOrderExists) return; // already handled by OrderStatusNotification

              trigger(
                abacusNotif.id,
                {
                  icon: abacusNotif.image && <$Icon src={abacusNotif.image} alt="" />,
                  title: stringGetter({ key: abacusNotif.title }),
                  body: abacusNotif.text ? stringGetter({ key: abacusNotif.text, params }) : '',
                  toastDuration: DEFAULT_TOAST_AUTO_CLOSE_MS,
                  toastSensitivity: 'foreground',
                  groupKey: abacusNotificationType,
                  renderCustomBody: ({ isToast, notification }) => (
                    <TradeNotification
                      isToast={isToast}
                      data={parsedData}
                      notification={notification}
                    />
                  ),
                },
                [abacusNotif.updateTimeInMilliseconds, abacusNotif.data],
                true
              );
              break;
            }
            case 'blockReward': {
              trigger(
                abacusNotif.id,
                {
                  icon: abacusNotif.image && <$Icon src={abacusNotif.image} alt="" />,
                  title: stringGetter({ key: abacusNotif.title }),
                  body: abacusNotif.text ? stringGetter({ key: abacusNotif.text, params }) : '',
                  toastDuration: DEFAULT_TOAST_AUTO_CLOSE_MS,
                  toastSensitivity: 'foreground',
                  groupKey: abacusNotificationType,
                  renderCustomBody: ({ isToast, notification }) => (
                    <BlockRewardNotification
                      isToast={isToast}
                      data={parsedData}
                      notification={notification}
                    />
                  ),
                },
                [abacusNotif.updateTimeInMilliseconds, abacusNotif.data],
                true
              );
              break;
            }
            default:
              trigger(
                abacusNotif.id,
                {
                  icon: abacusNotif.image && <$Icon src={abacusNotif.image} alt="" />,
                  title: stringGetter({ key: abacusNotif.title }),
                  body: abacusNotif.text ? stringGetter({ key: abacusNotif.text, params }) : '',
                  toastDuration: DEFAULT_TOAST_AUTO_CLOSE_MS,
                  toastSensitivity: 'foreground',
                  groupKey: abacusNotificationType,
                },
                [abacusNotif.updateTimeInMilliseconds, abacusNotif.data]
              );
              break;
          }
        }
      }, [abacusNotifications, stringGetter]);
    },
    useNotificationAction: () => {
      const dispatch = useAppDispatch();
      const orders = useAppSelector(getSubaccountOrders, shallowEqual) ?? [];
      const ordersById = groupBy(orders, 'id');
      const fills = useAppSelector(getSubaccountFills, shallowEqual) ?? [];
      const fillsById = groupBy(fills, 'id');
      const marketIds = useAppSelector(getMarketIds, shallowEqual);
      const navigate = useNavigate();

      return (notificationId: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [abacusNotificationType, id = ''] = notificationId.split(':');

        if (ordersById[id]) {
          dispatch(openDialog(DialogTypes.OrderDetails({ orderId: id })));
        } else if (fillsById[id]) {
          dispatch(openDialog(DialogTypes.FillDetails({ fillId: id })));
        } else if (marketIds.includes(id)) {
          navigate(`${AppRoute.Trade}/${id}`, {
            replace: true,
          });
        }
      };
    },
  },
  {
    type: NotificationType.SquidTransfer,
    useTrigger: ({ trigger }) => {
      const stringGetter = useStringGetter();
      const { transferNotifications } = useLocalNotifications();
      const selectedDydxChainId = useAppSelector(getSelectedDydxChainId);

      useEffect(() => {
        // eslint-disable-next-line no-restricted-syntax
        for (const transfer of transferNotifications) {
          const { id, fromChainId, status, txHash, toAmount, type, isExchange } = transfer;
          const isFinished =
            (Boolean(status) && status?.squidTransactionStatus !== 'ongoing') || isExchange;
          const icon = <Icon iconName={isFinished ? IconName.Transfer : IconName.Clock} />;

          const transferType =
            type ??
            (fromChainId === selectedDydxChainId
              ? TransferNotificationTypes.Withdrawal
              : TransferNotificationTypes.Deposit);

          const title = stringGetter({
            key: {
              deposit: isFinished ? STRING_KEYS.DEPOSIT : STRING_KEYS.DEPOSIT_IN_PROGRESS,
              withdrawal: isFinished ? STRING_KEYS.WITHDRAW : STRING_KEYS.WITHDRAW_IN_PROGRESS,
            }[transferType],
          });

          const toChainEta = status?.toChain?.chainData?.estimatedRouteDuration ?? 0;
          // TODO: remove typeguards once skip implements estimatedrouteduration
          // https://linear.app/dydx/issue/OTE-475/[web]-migration-followup-estimatedrouteduration
          const estimatedDuration =
            typeof toChainEta === 'string' ? toChainEta : formatSeconds(Math.max(toChainEta, 0));
          const body = stringGetter({
            key: STRING_KEYS.DEPOSIT_STATUS,
            params: {
              AMOUNT_USD: `${toAmount} ${DydxChainAsset.USDC.toUpperCase()}`,
              ESTIMATED_DURATION: estimatedDuration,
            },
          });

          trigger(
            id ?? txHash,
            {
              icon,
              title,
              body,
              renderCustomBody: ({ isToast, notification }) => (
                <TransferStatusNotification
                  isToast={isToast}
                  slotIcon={icon}
                  slotTitle={title}
                  transfer={transfer}
                  type={transferType}
                  triggeredAt={transfer.triggeredAt}
                  notification={notification}
                />
              ),
              toastSensitivity: 'foreground',
              groupKey: NotificationType.SquidTransfer,
            },
            [isFinished]
          );
        }
      }, [transferNotifications, stringGetter]);
    },
    useNotificationAction: () => {
      return () => {};
    },
  },
  {
    type: NotificationType.ReleaseUpdates,
    useTrigger: ({ trigger }) => {
      const { discoveryProgram } = useURLConfigs();
      const { chainTokenLabel } = useTokenConfigs();
      const stringGetter = useStringGetter();
      const featureFlags = useAllStatsigGateValues();
      const { incentivesDistributedSeasonId, rewardDistributionSeasonNumber } =
        useIncentivesSeason();

      const twitter200BVolumeExpirationDate = new Date('2024-08-16T23:59:59');
      const incentivesExpirationDate = new Date('2024-08-16T23:59:59');
      const tradeUSElectionExpirationDate = new Date('2024-08-16T23:59:59'); // TODO: (TRA-528): Update this date
      const currentDate = new Date();

      useEffect(() => {
        if (discoveryProgram) {
          trigger(
            ReleaseUpdateNotificationIds.DiscoveryProgram,
            {
              icon: <AssetIcon symbol={chainTokenLabel} />,
              title: stringGetter({
                key: 'NOTIFICATIONS.DISCOVERY_PROGRAM.TITLE',
              }),
              body: stringGetter({
                key: 'NOTIFICATIONS.DISCOVERY_PROGRAM.BODY',
                params: {
                  HERE_LINK: (
                    <Link href={discoveryProgram} isAccent isInline>
                      {stringGetter({ key: STRING_KEYS.HERE })}
                    </Link>
                  ),
                },
              }),
              toastSensitivity: 'foreground',
              groupKey: ReleaseUpdateNotificationIds.DiscoveryProgram,
            },
            []
          );
        }

        if (currentDate <= twitter200BVolumeExpirationDate) {
          trigger(
            ReleaseUpdateNotificationIds.Twitter200BVolume,
            {
              icon: <AssetIcon symbol={chainTokenLabel} />,
              title: stringGetter({
                key: STRING_KEYS.DISCOVERY_PROGRAM_TITLE,
              }),
              body: stringGetter({
                key: STRING_KEYS.DISCOVERY_PROGRAM_BODY,
                params: {
                  HERE_LINK: (
                    <Link href="https://x.com/dYdX/status/1819342483794415784" isAccent isInline>
                      {stringGetter({ key: STRING_KEYS.HERE })}
                    </Link>
                  ),
                },
              }),
              toastSensitivity: 'foreground',
              groupKey: ReleaseUpdateNotificationIds.Twitter200BVolume,
            },
            []
          );
        }

        if (currentDate <= incentivesExpirationDate) {
          trigger(
            INCENTIVES_SEASON_NOTIFICATION_ID,
            {
              icon: <AssetIcon symbol={chainTokenLabel} />,
              title: stringGetter({
                key: 'NOTIFICATIONS.INCENTIVES_SEASON_BEGUN.TITLE',
                params: { SEASON_NUMBER: CURRENT_SEASON_NUMBER },
              }),
              body: stringGetter({
                key: 'NOTIFICATIONS.INCENTIVES_SEASON_BEGUN.BODY',
                params: {
                  PREV_SEASON_NUMBER: CURRENT_SEASON_NUMBER - 2, // we generally only have data for rewards from 2 seasons ago because the new season launches before the previous season's rewards are distributed
                  DYDX_AMOUNT: MEDIAN_REWARDS_AMOUNT.DYDX,
                  USDC_AMOUNT: MEDIAN_REWARDS_AMOUNT.USDC,
                },
              }),
              toastSensitivity: 'foreground',
              groupKey: INCENTIVES_SEASON_NOTIFICATION_ID,
            },
            []
          );
        }

        if (
          featureFlags?.[StatSigFlags.ffShowPredictionMarketsUi] &&
          currentDate <= tradeUSElectionExpirationDate
        ) {
          trigger(
            MarketLaunchNotificationIds.TrumpWin,
            {
              title: stringGetter({ key: STRING_KEYS.TRUMPWIN_MARKET_LAUNCH_TITLE }),
              body: stringGetter({
                key: STRING_KEYS.TRUMPWIN_MARKET_LAUNCH_BODY,
                params: { MARKET: PREDICTION_MARKET.TRUMPWIN },
              }),
              renderCustomBody({ isToast, notification }) {
                return (
                  <MarketLaunchTrumpwinNotification isToast={isToast} notification={notification} />
                );
              },
              toastSensitivity: 'foreground',
              groupKey: MarketLaunchNotificationIds.TrumpWin,
            },
            []
          );
        }
      }, [stringGetter]);

      const { dydxAddress } = useAccounts();
      const { data, status } = useQueryChaosLabsIncentives({
        dydxAddress,
        season: rewardDistributionSeasonNumber,
      });

      const { dydxRewards } = data ?? {};

      useEffect(() => {
        const rewards = dydxRewards ?? 0;
        if (dydxAddress && status === 'success' && rewards > 0) {
          trigger(
            incentivesDistributedSeasonId,
            {
              icon: <AssetIcon symbol={chainTokenLabel} />,
              title: stringGetter({
                key: 'NOTIFICATIONS.REWARDS_DISTRIBUTED.TITLE',
                params: { SEASON_NUMBER: rewardDistributionSeasonNumber },
              }),
              body: stringGetter({
                key: 'NOTIFICATIONS.REWARDS_DISTRIBUTED.BODY',
                params: {
                  SEASON_NUMBER: rewardDistributionSeasonNumber,
                  DYDX_AMOUNT: rewards,
                },
              }),
              renderCustomBody({ isToast, notification }) {
                return (
                  <IncentiveSeasonDistributionNotification
                    isToast={isToast}
                    notification={notification}
                    data={{
                      points: rewards,
                      chainTokenLabel,
                    }}
                  />
                );
              },
              toastSensitivity: 'foreground',
              groupKey: incentivesDistributedSeasonId,
            },
            []
          );
        }
      }, [stringGetter, dydxAddress, status, dydxRewards]);
    },
    useNotificationAction: () => {
      const { chainTokenLabel } = useTokenConfigs();
      const { incentivesDistributedSeasonId } = useIncentivesSeason();

      const navigate = useNavigate();

      return (notificationId: string) => {
        if (
          notificationId === INCENTIVES_SEASON_NOTIFICATION_ID ||
          notificationId === incentivesDistributedSeasonId
        ) {
          navigate(`${chainTokenLabel}`);
        }
      };
    },
  },
  {
    type: NotificationType.MarketWindDown,
    useTrigger: ({ trigger }) => {
      const stringGetter = useStringGetter();

      const { rndrParamProposal } = useURLConfigs();

      const currentDate = new Date();

      const RNDNProposalTriggerDate = new Date('2024-07-20T22:00:00.000Z');
      const RNDNProposalExpireDate = new Date('2024-08-20T22:00:00.000Z');

      const RNDRMarket = 'RNDR-USD';

      useEffect(() => {
        if (
          rndrParamProposal &&
          currentDate >= RNDNProposalTriggerDate &&
          currentDate <= RNDNProposalExpireDate
        ) {
          trigger(
            MarketWindDownNotificationIds.MarketUpdateProposalRndr,
            {
              title: stringGetter({
                key: 'NOTIFICATIONS.MARKET_PARAM_UPDATE.TITLE',
                params: {
                  MARKET: RNDRMarket,
                },
              }),
              body: stringGetter({
                key: 'NOTIFICATIONS.MARKET_PARAM_UPDATE.BODY',
                params: {
                  MARKET: RNDRMarket,
                  HERE_LINK: (
                    <Link href={rndrParamProposal} isAccent isInline>
                      {stringGetter({ key: STRING_KEYS.HERE })}
                    </Link>
                  ),
                },
              }),
              toastSensitivity: 'foreground',
              groupKey: MarketWindDownNotificationIds.MarketUpdateProposalRndr,
            },
            []
          );
        }
      }, [stringGetter]);
    },
    useNotificationAction: () => {
      return () => {};
    },
  },
  {
    type: NotificationType.ApiError,
    useTrigger: ({ trigger, hideNotification }) => {
      const stringGetter = useStringGetter();
      const { statusErrorMessage } = useApiState();
      const { statusPage } = useURLConfigs();

      useEffect(() => {
        if (statusErrorMessage) {
          trigger(
            NotificationType.ApiError,
            {
              icon: <$WarningIcon iconName={IconName.Warning} />,
              title: statusErrorMessage.title,
              body: statusErrorMessage.body,
              toastSensitivity: 'foreground',
              groupKey: NotificationType.ApiError,
              withClose: false,
              actionAltText: stringGetter({ key: STRING_KEYS.STATUS_PAGE }),
              renderActionSlot: () => (
                <Link href={statusPage}>{stringGetter({ key: STRING_KEYS.STATUS_PAGE })} →</Link>
              ),
            },
            [],
            true,
            true // unhide on new error (i.e. normal -> not normal api status)
          );
        } else {
          // hide/expire existing notification if no error
          hideNotification({
            type: NotificationType.ApiError,
            id: NotificationType.ApiError,
          });
        }
      }, [stringGetter, statusErrorMessage?.body, statusErrorMessage?.title, hideNotification]);
    },
    useNotificationAction: () => {
      return () => {};
    },
  },
  {
    type: NotificationType.ComplianceAlert,
    useTrigger: ({ trigger }) => {
      const stringGetter = useStringGetter();
      const { complianceMessage, complianceState, complianceStatus } = useComplianceState();

      useEffect(() => {
        if (complianceState !== ComplianceStates.FULL_ACCESS) {
          const displayData: NotificationDisplayData = {
            icon: <$WarningIcon iconName={IconName.Warning} />,
            title: stringGetter({ key: STRING_KEYS.COMPLIANCE_WARNING }),
            body: complianceMessage,
            toastSensitivity: 'foreground',
            groupKey: NotificationType.ComplianceAlert,
            withClose: false,
          };

          trigger(`${NotificationType.ComplianceAlert}-${complianceStatus}`, displayData, []);
        }
      }, [stringGetter, complianceMessage, complianceState, complianceStatus]);
    },
    useNotificationAction: () => {
      const dispatch = useAppDispatch();
      const { complianceStatus } = useComplianceState();

      return () => {
        if (complianceStatus === ComplianceStatus.FIRST_STRIKE_CLOSE_ONLY) {
          dispatch(openDialog(DialogTypes.GeoCompliance()));
        }
      };
    },
  },
  {
    type: NotificationType.OrderStatus,
    useTrigger: ({ trigger }) => {
      const localPlaceOrders = useAppSelector(getLocalPlaceOrders, shallowEqual);
      const localCancelOrders = useAppSelector(getLocalCancelOrders, shallowEqual);
      const allOrders = useAppSelector(getSubaccountOrders, shallowEqual);
      const stringGetter = useStringGetter();

      useEffect(() => {
        // eslint-disable-next-line no-restricted-syntax
        for (const localPlace of localPlaceOrders) {
          const key = localPlace.clientId.toString();
          trigger(
            key,
            {
              icon: null,
              title: stringGetter({ key: STRING_KEYS.ORDER_STATUS }),
              toastSensitivity: 'background',
              groupKey: key, // do not collapse
              toastDuration: DEFAULT_TOAST_AUTO_CLOSE_MS,
              renderCustomBody: ({ isToast, notification }) => (
                <OrderStatusNotification
                  isToast={isToast}
                  localOrder={localPlace}
                  notification={notification}
                />
              ),
            },
            [localPlace.submissionStatus, localPlace.errorParams],
            true
          );
        }
      }, [localPlaceOrders]);

      useEffect(() => {
        // eslint-disable-next-line no-restricted-syntax
        for (const localCancel of localCancelOrders) {
          // ensure order exists
          const existingOrder = allOrders?.find((order) => order.id === localCancel.orderId);
          if (!existingOrder) return;

          // share same notification with existing local order if exists
          // so that canceling a local order will not add an extra notification
          const key = (existingOrder.clientId ?? localCancel.orderId).toString();

          trigger(
            key,
            {
              icon: null,
              title: stringGetter({ key: STRING_KEYS.ORDER_STATUS }),
              toastSensitivity: 'background',
              groupKey: key,
              toastDuration: DEFAULT_TOAST_AUTO_CLOSE_MS,
              renderCustomBody: ({ isToast, notification }) => (
                <OrderCancelNotification
                  isToast={isToast}
                  localCancel={localCancel}
                  notification={notification}
                />
              ),
            },
            [localCancel.submissionStatus, localCancel.errorParams],
            true
          );
        }
      }, [localCancelOrders]);
    },
    useNotificationAction: () => {
      const dispatch = useAppDispatch();
      const orders = useAppSelector(getSubaccountOrders, shallowEqual) ?? [];

      return (orderClientId: string) => {
        const order = orders.find((o) => o.clientId?.toString() === orderClientId);
        if (order) {
          dispatch(openDialog(DialogTypes.OrderDetails({ orderId: order.id })));
        }
      };
    },
  },
];

const $Icon = tw.img`h-1.5 w-1.5`;

const $WarningIcon = tw(Icon)`text-color-warning`;
