import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

/**
 * Health Check HTTP Endpoint
 */
export const healthCheck = functions.https.onRequest((req, res) => {
  res.status(200).send({
    status: 'ok',
    service: 'TripTrack Cloud Functions',
    timestamp: new Date().toISOString(),
  });
});

/**
 * STEP 6 & STEP 8: On Stop Created -> Duplicate-Resistant FCM Push Notifications
 * 
 * IDEMPOTENCY & DUPLICATE-RESISTANCE:
 * Uses atomic Firestore transactions on `stopDeliveries/{stopId}_{recipientUid}` records
 * so concurrent function invocations or retries cannot independently trigger duplicate
 * notifications to the same recipient for a single stop event.
 * 
 * APPLICATION GUARANTEE:
 * Duplicate-resistant stop notification processing, with at most one intended notification
 * operation per stop/recipient under normal retries and concurrent function invocations.
 */
export const onStopCreated = functions.firestore
  .document('trips/{tripId}/stops/{stopId}')
  .onCreate(async (snapshot, context) => {
    const { tripId, stopId } = context.params;
    const stopData = snapshot.data();

    if (!stopData) {
      functions.logger.warn(`Stop snapshot is empty for ${stopId}`);
      return null;
    }

    const creatorUid = stopData.uid;
    const isAuto = stopData.autoDetected || stopData.type === 'auto';
    const creatorName = stopData.displayName || 'A trip member';
    const stopName = stopData.name || 'New Stop';
    const notePreview = stopData.note ? stopData.note.substring(0, 60) : '';

    functions.logger.info(`[onStopCreated] New stop created in trip ${tripId} by ${creatorName}: "${stopName}" (Auto: ${isAuto})`);

    try {
      // 1. Fetch trip members
      const membersSnap = await admin.firestore()
        .collection('trips')
        .doc(tripId)
        .collection('members')
        .get();

      if (membersSnap.empty) {
        functions.logger.info(`No members found for trip ${tripId}`);
        return null;
      }

      // 2. Exclude creator
      const targetMemberUids = membersSnap.docs
        .map((doc) => doc.id)
        .filter((uid) => uid !== creatorUid);

      if (targetMemberUids.length === 0) {
        functions.logger.info(`No target members to notify for trip ${tripId}`);
        return null;
      }

      // 3. Fetch user documents with fcmTokens
      const userDocs = await Promise.all(
        targetMemberUids.map((uid) => admin.firestore().collection('users').doc(uid).get())
      );

      const pushPayload = {
        notification: {
          title: isAuto ? `🤖 Stop detected: ${stopName}` : `🚩 ${creatorName} marked a stop!`,
          body: notePreview ? `${stopName} — "${notePreview}"` : stopName,
        },
        data: {
          tripId: String(tripId),
          stopId: String(stopId),
          lat: String(stopData.lat || 0),
          lng: String(stopData.lng || 0),
        },
      };

      // 4. Duplicate-resistant recipient delivery with atomic transaction claim
      const sendPromises = userDocs.map(async (userSnap) => {
        const uid = userSnap.id;
        const userData = userSnap.data();
        const fcmToken = userData?.fcmToken;

        if (!fcmToken) {
          functions.logger.info(`Skipping user ${uid}: No fcmToken registered.`);
          return;
        }

        const deliveryRef = admin.firestore().collection('stopDeliveries').doc(`${stopId}_${uid}`);

        // Atomic transaction claim
        const claimed = await admin.firestore().runTransaction(async (transaction) => {
          const deliveryDoc = await transaction.get(deliveryRef);
          if (deliveryDoc.exists) {
            const status = deliveryDoc.data()?.status;
            if (status === 'sent' || status === 'claimed') {
              return false; // Delivery already claimed or completed
            }
          }
          transaction.set(
            deliveryRef,
            {
              stopId,
              recipientUid: uid,
              status: 'claimed',
              claimedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return true;
        });

        if (!claimed) {
          functions.logger.info(`Delivery record for ${stopId}:${uid} already claimed/sent. Skipping.`);
          return;
        }

        // Send FCM notification
        try {
          const messageId = await admin.messaging().send({
            token: fcmToken,
            notification: pushPayload.notification,
            data: pushPayload.data,
          });

          await deliveryRef.update({
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            messageId: messageId || 'sent',
          });

          functions.logger.info(`Push notification successfully delivered to user ${uid} (msgId: ${messageId})`);
        } catch (err: any) {
          functions.logger.warn(`Failed to send push notification to user ${uid} (token: ${fcmToken}):`, err.message);
          await deliveryRef.update({
            status: 'failed',
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: err.message || 'FCM delivery error',
          });
        }
      });

      await Promise.allSettled(sendPromises);
      await snapshot.ref.update({ notificationSent: true });
    } catch (err) {
      functions.logger.error(`Error in onStopCreated trigger for trip ${tripId}:`, err);
    }

    return null;
  });

/**
 * STEP 9: Scheduled Stale Location Checker (runs every 15 minutes)
 * 
 * SCHEDULER TIMING NOTICE:
 * Minimum age threshold for alert eligibility is LOCATION_ALERT_AFTER_MS (10 minutes).
 * Running on a 15-minute cron schedule means actual alert delivery occurs when the scheduled job runs
 * after the 10-minute threshold is crossed (e.g. at 12-15 minutes). Notification body reports exact actual age.
 * 
 * EPISODE & RECIPIENT IDEMPOTENCY:
 * - Episode ID: `staleAlertEpisodes/${tripId}_${staleUid}_${lastLocationUpdatedAt}`
 * - Delivery record: `staleAlertEpisodes/${episodeId}/deliveries/${recipientUid}` using atomic transactions.
 * - Maximum 1 alert per recipient per distinct stale episode.
 */
export const checkStaleLocations = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async (context) => {
    const now = Date.now();
    const LOCATION_ALERT_AFTER_MS = 10 * 60 * 1000; // 10 minutes minimum age

    functions.logger.info('[checkStaleLocations] Running scheduled stale location check across trips...');

    try {
      // Query active trips only (ignore planned and completed trips)
      const tripsSnap = await admin.firestore().collection('trips').where('status', '==', 'active').get();
      if (tripsSnap.empty) return null;

      for (const tripDoc of tripsSnap.docs) {
        const tripId = tripDoc.id;
        // Query locations filtering sharingEnabled == true to avoid unrestricted database scans
        const locationsSnap = await admin.firestore()
          .collection('trips')
          .doc(tripId)
          .collection('locations')
          .where('sharingEnabled', '==', true)
          .get();

        if (locationsSnap.empty) continue;

        for (const locDoc of locationsSnap.docs) {
          const locData = locDoc.data();
          const staleUid = locDoc.id;
          const rawUpdatedAt = locData.updatedAt;

          // Normalize timestamp to scalar epoch millis
          const normalizedMillis =
            typeof rawUpdatedAt === 'number'
              ? rawUpdatedAt
              : typeof rawUpdatedAt?.toMillis === 'function'
              ? rawUpdatedAt.toMillis()
              : typeof rawUpdatedAt?.seconds === 'number'
              ? rawUpdatedAt.seconds * 1000
              : typeof rawUpdatedAt === 'string'
              ? Date.parse(rawUpdatedAt)
              : null;

          // Rule: Never-shared or invalid timestamps MUST NOT generate stale alerts
          if (!normalizedMillis || isNaN(normalizedMillis)) continue;

          const elapsedMs = now - normalizedMillis;
          if (elapsedMs < LOCATION_ALERT_AFTER_MS) continue;

          const actualAgeMins = Math.floor(elapsedMs / 60000);
          const displayName = locData.displayName || 'A trip member';
          // Scalar deterministic episode ID
          const episodeId = `${tripId}_${staleUid}_${normalizedMillis}`;

          // Pre-send re-validation: fetch fresh location doc
          const reCheckLoc = await admin.firestore()
            .collection('trips')
            .doc(tripId)
            .collection('locations')
            .doc(staleUid)
            .get();
          
          if (!reCheckLoc.exists) continue;
          const freshData = reCheckLoc.data();
          if (freshData?.sharingEnabled === false || (freshData?.updatedAt && now - freshData.updatedAt < LOCATION_ALERT_AFTER_MS)) {
            functions.logger.info(`User ${staleUid} recovered or turned sharing off before alert dispatch. Skipping.`);
            continue;
          }

          // Record Stale Episode
          const episodeRef = admin.firestore().collection('staleAlertEpisodes').doc(episodeId);
          await episodeRef.set(
            {
              episodeId,
              tripId,
              staleUid,
              lastLocationUpdatedAt: normalizedMillis,
              detectedAt: admin.firestore.FieldValue.serverTimestamp(),
              status: 'active',
            },
            { merge: true }
          );

          // Fetch active trip members excluding stale user
          const membersSnap = await admin.firestore()
            .collection('trips')
            .doc(tripId)
            .collection('members')
            .get();

          const targetMemberUids = membersSnap.docs
            .map((d) => d.id)
            .filter((id) => id !== staleUid);

          if (targetMemberUids.length === 0) continue;

          const userDocs = await Promise.all(
            targetMemberUids.map((uid) => admin.firestore().collection('users').doc(uid).get())
          );

          const pushPayload = {
            notification: {
              title: `⌛ Location Update Delayed`,
              body: `${displayName}'s location hasn't updated for ${actualAgeMins} minutes.`,
            },
            data: {
              tripId: String(tripId),
              staleUid: String(staleUid),
              type: 'stale_location_alert',
            },
          };

          // Deliver to recipients with atomic transaction claiming per recipient
          const sendPromises = userDocs.map(async (userSnap) => {
            const recipientUid = userSnap.id;
            const userData = userSnap.data();
            const fcmToken = userData?.fcmToken;

            if (!fcmToken) return;

            const deliveryRef = episodeRef.collection('deliveries').doc(recipientUid);

            const claimed = await admin.firestore().runTransaction(async (transaction) => {
              const deliveryDoc = await transaction.get(deliveryRef);
              if (deliveryDoc.exists) {
                const status = deliveryDoc.data()?.status;
                if (status === 'sent' || status === 'claimed') return false;
              }
              transaction.set(
                deliveryRef,
                {
                  episodeId,
                  recipientUid,
                  status: 'claimed',
                  claimedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true }
              );
              return true;
            });

            if (!claimed) return;

            try {
              const messageId = await admin.messaging().send({
                token: fcmToken,
                notification: pushPayload.notification,
                data: pushPayload.data,
              });

              await deliveryRef.update({
                status: 'sent',
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                messageId: messageId || 'sent',
              });
            } catch (err: any) {
              functions.logger.warn(`Failed stale alert send to recipient ${recipientUid}:`, err.message);
              await deliveryRef.update({
                status: 'failed',
                failedAt: admin.firestore.FieldValue.serverTimestamp(),
                error: err.message || 'FCM error',
              });
            }
          });

          await Promise.allSettled(sendPromises);
        }
      }
    } catch (err) {
      functions.logger.error('Error running checkStaleLocations scheduled function:', err);
    }

    return null;
  });
