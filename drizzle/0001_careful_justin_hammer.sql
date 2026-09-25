CREATE TABLE `source_authentications` (
	`id` text PRIMARY KEY NOT NULL,
	`capture_id` text NOT NULL,
	`reviewed_url` text NOT NULL,
	`reviewed_content_hash` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`method` text NOT NULL,
	`notes` text NOT NULL,
	`verified_at` integer NOT NULL,
	FOREIGN KEY (`capture_id`) REFERENCES `source_captures`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "source_authentications_nonempty" CHECK(trim("source_authentications"."reviewed_url") <> '' AND trim("source_authentications"."reviewed_content_hash") <> '' AND trim("source_authentications"."reviewer_id") <> '' AND trim("source_authentications"."method") <> '' AND trim("source_authentications"."notes") <> '')
);
--> statement-breakpoint
CREATE INDEX `source_authentications_capture_verified_idx` ON `source_authentications` (`capture_id`,`verified_at`);--> statement-breakpoint
CREATE TRIGGER `source_authentications_integrity` BEFORE INSERT ON `source_authentications` BEGIN
  SELECT RAISE(ABORT, 'authentication must match preserved capture') WHERE NOT EXISTS (
    SELECT 1 FROM source_captures c JOIN source_communications s ON s.id = c.communication_id
    WHERE c.id = NEW.capture_id AND c.content_hash = NEW.reviewed_content_hash
      AND NEW.reviewed_url IN (c.capture_url, s.canonical_url)
      AND NEW.verified_at >= c.captured_at
  );
END;
--> statement-breakpoint
CREATE TRIGGER `source_authentications_immutable_update` BEFORE UPDATE ON `source_authentications` BEGIN SELECT RAISE(ABORT, 'append a new source authentication'); END;
--> statement-breakpoint
CREATE TRIGGER `source_authentications_immutable_delete` BEFORE DELETE ON `source_authentications` BEGIN SELECT RAISE(ABORT, 'source authentication is immutable'); END;
--> statement-breakpoint
-- No evidence can be attached once human review has begun. The next review
-- must consider a new adjudication revision if its evidence set changes.
CREATE TRIGGER `adjudication_evidence_protect_reviewed` BEFORE INSERT ON `adjudication_evidence` WHEN EXISTS (
  SELECT 1 FROM reviews r WHERE r.adjudication_id = NEW.adjudication_id
) BEGIN SELECT RAISE(ABORT, 'reviewed adjudication evidence is locked'); END;
--> statement-breakpoint
DROP TRIGGER `publication_integrity`;
--> statement-breakpoint
CREATE TRIGGER `publication_integrity` BEFORE INSERT ON `publications` BEGIN
  SELECT RAISE(ABORT, 'rated publication disabled pending approved methodology') WHERE EXISTS (
    SELECT 1 FROM adjudications a WHERE a.id = NEW.adjudication_id AND a.state = 'RATED'
  );
  SELECT RAISE(ABORT, 'publication requires authenticated preserved source') WHERE NOT EXISTS (
    SELECT 1 FROM adjudications a
    JOIN representations r ON r.id = a.representation_id
    JOIN source_captures c ON c.id = r.capture_id
    JOIN materiality_decisions m ON m.id = a.materiality_decision_id
    JOIN source_authentications sa ON sa.capture_id = c.id AND sa.reviewed_content_hash = c.content_hash
    WHERE a.id = NEW.adjudication_id AND sa.verified_at <= m.locked_at
      AND sa.verified_at <= NEW.published_at
  );
  SELECT RAISE(ABORT, 'publication requires latest approved review after adjudication') WHERE NOT EXISTS (
    SELECT 1 FROM reviews r JOIN adjudications a ON a.id = r.adjudication_id
    WHERE r.id = NEW.approved_review_id AND r.adjudication_id = NEW.adjudication_id
      AND r.decision = 'APPROVED' AND r.created_at >= a.created_at AND r.created_at <= NEW.published_at
      AND r.id = (SELECT last.id FROM reviews last WHERE last.adjudication_id = a.id
        ORDER BY last.created_at DESC, last.id DESC LIMIT 1)
  );
  SELECT RAISE(ABORT, 'publication requires approved representation and materiality lock') WHERE NOT EXISTS (
    SELECT 1 FROM adjudications a
    JOIN representations r ON r.id = a.representation_id AND r.status = 'APPROVED' AND r.proposition_id = a.proposition_id
    JOIN materiality_decisions m ON m.id = a.materiality_decision_id AND m.representation_id = r.id
    WHERE a.id = NEW.adjudication_id AND m.tier <> 'NOT_MATERIAL'
  );
  SELECT RAISE(ABORT, 'publication requires current adjudication revision') WHERE EXISTS (
    SELECT 1 FROM adjudications a JOIN adjudications later
      ON later.representation_id = a.representation_id AND later.revision > a.revision
    WHERE a.id = NEW.adjudication_id
  );
  SELECT RAISE(ABORT, 'publication requires documented bilateral evidence searches') WHERE EXISTS (
    SELECT 1 FROM adjudications a WHERE a.id = NEW.adjudication_id
      AND (trim(a.supporting_search) = '' OR trim(a.contrary_search) = '')
  );
END;
