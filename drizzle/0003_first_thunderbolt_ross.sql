CREATE TABLE `evidence_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`representation_id` text NOT NULL,
	`proposition_id` text NOT NULL,
	`materiality_decision_id` text NOT NULL,
	`side` text NOT NULL,
	`strategy` text NOT NULL,
	`results_summary` text NOT NULL,
	`searched_at` integer NOT NULL,
	`reviewer_id` text NOT NULL,
	FOREIGN KEY (`representation_id`) REFERENCES `representations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposition_id`) REFERENCES `propositions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`materiality_decision_id`) REFERENCES `materiality_decisions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "evidence_searches_side_allowed" CHECK("evidence_searches"."side" IN ('SUPPORTS','CONTRADICTS')),
	CONSTRAINT "evidence_searches_nonempty" CHECK(trim("evidence_searches"."strategy") <> '' AND trim("evidence_searches"."results_summary") <> '' AND trim("evidence_searches"."reviewer_id") <> '')
);
--> statement-breakpoint
CREATE INDEX `evidence_searches_representation_side_idx` ON `evidence_searches` (`representation_id`,`side`,`searched_at`);--> statement-breakpoint
CREATE TRIGGER `evidence_searches_integrity` BEFORE INSERT ON `evidence_searches` BEGIN
  SELECT RAISE(ABORT, 'evidence search requires approved representation and authenticated, locked materiality') WHERE NOT EXISTS (
    SELECT 1 FROM representations r
    JOIN source_captures c ON c.id = r.capture_id
    JOIN source_authentications sa ON sa.capture_id = c.id AND sa.reviewed_content_hash = c.content_hash
    JOIN materiality_decisions m ON m.id = NEW.materiality_decision_id AND m.representation_id = r.id
    WHERE r.id = NEW.representation_id AND r.status = 'APPROVED'
      AND r.proposition_id = NEW.proposition_id AND m.tier <> 'NOT_MATERIAL'
      AND sa.verified_at <= m.locked_at AND m.locked_at < NEW.searched_at
  );
  SELECT RAISE(ABORT, 'adjudicated evidence searches are locked') WHERE EXISTS (
    SELECT 1 FROM adjudications a WHERE a.representation_id = NEW.representation_id
  );
END;
--> statement-breakpoint
CREATE TRIGGER `evidence_searches_immutable_update` BEFORE UPDATE ON `evidence_searches` BEGIN SELECT RAISE(ABORT, 'append a new evidence search'); END;
--> statement-breakpoint
CREATE TRIGGER `evidence_searches_immutable_delete` BEFORE DELETE ON `evidence_searches` BEGIN SELECT RAISE(ABORT, 'evidence search is immutable'); END;
--> statement-breakpoint
DROP TRIGGER `scoring_proposals_integrity`;
--> statement-breakpoint
CREATE TRIGGER `scoring_proposals_integrity` BEFORE INSERT ON `scoring_proposals` BEGIN
  SELECT RAISE(ABORT, 'assessment requires authenticated approved representation and locked materiality') WHERE NOT EXISTS (
    SELECT 1 FROM representations r
    JOIN source_captures c ON c.id = r.capture_id
    JOIN source_authentications sa ON sa.capture_id = c.id AND sa.reviewed_content_hash = c.content_hash
    JOIN materiality_decisions m ON m.representation_id = r.id AND m.tier <> 'NOT_MATERIAL'
    WHERE r.id = NEW.representation_id AND r.status = 'APPROVED'
      AND r.proposition_id = NEW.proposition_id AND m.methodology_version_id = NEW.methodology_version_id
      AND sa.verified_at <= m.locked_at AND m.locked_at < NEW.created_at
      AND EXISTS (SELECT 1 FROM evidence_searches es WHERE es.representation_id = r.id
        AND es.proposition_id = r.proposition_id AND es.materiality_decision_id = m.id
        AND es.side = 'SUPPORTS' AND es.searched_at < NEW.created_at)
      AND EXISTS (SELECT 1 FROM evidence_searches es WHERE es.representation_id = r.id
        AND es.proposition_id = r.proposition_id AND es.materiality_decision_id = m.id
        AND es.side = 'CONTRADICTS' AND es.searched_at < NEW.created_at)
  );
END;
--> statement-breakpoint
CREATE TRIGGER `adjudication_requires_evidence_searches` BEFORE INSERT ON `adjudications` BEGIN
  SELECT RAISE(ABORT, 'adjudication requires prior bilateral evidence searches') WHERE NOT EXISTS (
    SELECT 1 FROM evidence_searches es WHERE es.representation_id = NEW.representation_id
      AND es.proposition_id = NEW.proposition_id AND es.materiality_decision_id = NEW.materiality_decision_id
      AND es.side = 'SUPPORTS' AND es.searched_at <= NEW.evidence_cutoff_at
      AND es.searched_at <= NEW.created_at
  ) OR NOT EXISTS (
    SELECT 1 FROM evidence_searches es WHERE es.representation_id = NEW.representation_id
      AND es.proposition_id = NEW.proposition_id AND es.materiality_decision_id = NEW.materiality_decision_id
      AND es.side = 'CONTRADICTS' AND es.searched_at <= NEW.evidence_cutoff_at
      AND es.searched_at <= NEW.created_at
  );
END;
