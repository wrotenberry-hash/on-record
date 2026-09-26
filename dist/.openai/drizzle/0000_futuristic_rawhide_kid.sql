CREATE TABLE `adjudication_evidence` (
	`adjudication_id` text NOT NULL,
	`proposition_evidence_id` text NOT NULL,
	`consideration` text NOT NULL,
	PRIMARY KEY(`adjudication_id`, `proposition_evidence_id`),
	FOREIGN KEY (`adjudication_id`) REFERENCES `adjudications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposition_evidence_id`) REFERENCES `proposition_evidence`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `adjudications` (
	`id` text PRIMARY KEY NOT NULL,
	`representation_id` text NOT NULL,
	`proposition_id` text NOT NULL,
	`materiality_decision_id` text NOT NULL,
	`methodology_version_id` text NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	`score` integer,
	`explanation` text NOT NULL,
	`supporting_search` text NOT NULL,
	`contrary_search` text NOT NULL,
	`evidence_search_started_at` integer NOT NULL,
	`evidence_cutoff_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`authored_by` text NOT NULL,
	FOREIGN KEY (`representation_id`) REFERENCES `representations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposition_id`) REFERENCES `propositions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`materiality_decision_id`) REFERENCES `materiality_decisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`methodology_version_id`) REFERENCES `methodology_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "adjudication_state_score" CHECK(("adjudications"."state" = 'CHECKING' AND "adjudications"."score" IS NULL) OR ("adjudications"."state" = 'RATED' AND "adjudications"."score" IN (100, 85, 65, 35, 15, 0))),
	CONSTRAINT "adjudication_evidence_interval" CHECK("adjudications"."evidence_search_started_at" <= "adjudications"."evidence_cutoff_at" AND "adjudications"."evidence_cutoff_at" <= "adjudications"."created_at"),
	CONSTRAINT "adjudication_revision_positive" CHECK("adjudications"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adjudications_representation_revision_uq` ON `adjudications` (`representation_id`,`revision`);--> statement-breakpoint
CREATE INDEX `adjudications_proposition_idx` ON `adjudications` (`proposition_id`);--> statement-breakpoint
CREATE TABLE `corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`replacement_publication_id` text,
	`reason` text NOT NULL,
	`corrected_at` integer NOT NULL,
	`corrected_by` text NOT NULL,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`replacement_publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `corrections_publication_idx` ON `corrections` (`publication_id`);--> statement-breakpoint
CREATE TABLE `evidence_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source_url` text,
	`source_name` text NOT NULL,
	`source_type` text NOT NULL,
	`published_at` integer,
	`captured_at` integer NOT NULL,
	`effective_from` integer,
	`effective_to` integer,
	`jurisdiction` text,
	`excerpt` text NOT NULL,
	`content_hash` text,
	`supersedes_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`supersedes_id`) REFERENCES `evidence_objects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "evidence_effective_interval" CHECK("evidence_objects"."effective_from" IS NULL OR "evidence_objects"."effective_to" IS NULL OR "evidence_objects"."effective_from" <= "evidence_objects"."effective_to")
);
--> statement-breakpoint
CREATE INDEX `evidence_source_url_idx` ON `evidence_objects` (`source_url`);--> statement-breakpoint
CREATE TABLE `materiality_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`representation_id` text NOT NULL,
	`methodology_version_id` text NOT NULL,
	`tier` text NOT NULL,
	`rationale` text NOT NULL,
	`locked_at` integer NOT NULL,
	`decided_by` text NOT NULL,
	FOREIGN KEY (`representation_id`) REFERENCES `representations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`methodology_version_id`) REFERENCES `methodology_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "materiality_tier_allowed" CHECK("materiality_decisions"."tier" IN ('CRITICAL', 'MAJOR', 'SUPPORTING', 'NOT_MATERIAL'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `materiality_representation_uq` ON `materiality_decisions` (`representation_id`);--> statement-breakpoint
CREATE TABLE `methodology_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`description` text NOT NULL,
	`effective_at` integer NOT NULL,
	`document_hash` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `methodology_label_uq` ON `methodology_versions` (`label`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_slug_uq` ON `people` (`slug`);--> statement-breakpoint
CREATE TABLE `proposition_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`proposition_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`stance` text NOT NULL,
	`applicability` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`proposition_id`) REFERENCES `propositions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence_objects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "evidence_stance_allowed" CHECK("proposition_evidence"."stance" IN ('SUPPORTS', 'CONTRADICTS', 'CONTEXT'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposition_evidence_unique` ON `proposition_evidence` (`proposition_id`,`evidence_id`,`stance`);--> statement-breakpoint
CREATE INDEX `proposition_evidence_evidence_idx` ON `proposition_evidence` (`evidence_id`);--> statement-breakpoint
CREATE TABLE `proposition_relations` (
	`proposition_id` text NOT NULL,
	`related_proposition_id` text NOT NULL,
	`relation` text NOT NULL,
	`rationale` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`proposition_id`, `related_proposition_id`, `relation`),
	FOREIGN KEY (`proposition_id`) REFERENCES `propositions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_proposition_id`) REFERENCES `propositions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "proposition_relation_not_self" CHECK("proposition_relations"."proposition_id" <> "proposition_relations"."related_proposition_id"),
	CONSTRAINT "proposition_relation_allowed" CHECK("proposition_relations"."relation" IN ('EQUIVALENT', 'RELATED', 'SUPERSEDES', 'CONTRADICTS'))
);
--> statement-breakpoint
CREATE TABLE `propositions` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_text` text NOT NULL,
	`scope` text,
	`jurisdiction` text,
	`valid_from` integer,
	`valid_to` integer,
	`quantifier` text,
	`issue` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "proposition_valid_interval" CHECK("propositions"."valid_from" IS NULL OR "propositions"."valid_to" IS NULL OR "propositions"."valid_from" <= "propositions"."valid_to")
);
--> statement-breakpoint
CREATE INDEX `propositions_issue_idx` ON `propositions` (`issue`);--> statement-breakpoint
CREATE TABLE `publications` (
	`id` text PRIMARY KEY NOT NULL,
	`adjudication_id` text NOT NULL,
	`approved_review_id` text NOT NULL,
	`published_at` integer NOT NULL,
	`published_by` text NOT NULL,
	`retraction_of_id` text,
	`note` text,
	FOREIGN KEY (`adjudication_id`) REFERENCES `adjudications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`retraction_of_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `publications_adjudication_idx` ON `publications` (`adjudication_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `representations` (
	`id` text PRIMARY KEY NOT NULL,
	`capture_id` text NOT NULL,
	`proposition_id` text,
	`exact_text` text NOT NULL,
	`start_offset` integer,
	`end_offset` integer,
	`context` text,
	`extracted_at` integer NOT NULL,
	`status` text DEFAULT 'CANDIDATE' NOT NULL,
	FOREIGN KEY (`capture_id`) REFERENCES `source_captures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposition_id`) REFERENCES `propositions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "representation_status_allowed" CHECK("representations"."status" IN ('CANDIDATE', 'APPROVED', 'REJECTED')),
	CONSTRAINT "representation_offset_order" CHECK("representations"."start_offset" IS NULL OR "representations"."end_offset" IS NULL OR ("representations"."start_offset" >= 0 AND "representations"."start_offset" <= "representations"."end_offset"))
);
--> statement-breakpoint
CREATE INDEX `representations_capture_idx` ON `representations` (`capture_id`);--> statement-breakpoint
CREATE INDEX `representations_proposition_idx` ON `representations` (`proposition_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`adjudication_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`decision` text NOT NULL,
	`notes` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`adjudication_id`) REFERENCES `adjudications`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "review_decision_allowed" CHECK("reviews"."decision" IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED'))
);
--> statement-breakpoint
CREATE INDEX `reviews_adjudication_idx` ON `reviews` (`adjudication_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `source_captures` (
	`id` text PRIMARY KEY NOT NULL,
	`communication_id` text NOT NULL,
	`revision` integer NOT NULL,
	`captured_at` integer NOT NULL,
	`capture_url` text,
	`content_type` text NOT NULL,
	`original_content` text NOT NULL,
	`transcript` text,
	`content_hash` text NOT NULL,
	`retrieval_metadata` text,
	FOREIGN KEY (`communication_id`) REFERENCES `source_communications`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "captures_revision_positive" CHECK("source_captures"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `captures_communication_revision_uq` ON `source_captures` (`communication_id`,`revision`);--> statement-breakpoint
CREATE TABLE `source_communications` (
	`id` text PRIMARY KEY NOT NULL,
	`speaker_id` text NOT NULL,
	`source_type` text NOT NULL,
	`platform` text,
	`canonical_url` text,
	`external_id` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`speaker_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `communications_speaker_published_idx` ON `source_communications` (`speaker_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `communications_url_idx` ON `source_communications` (`canonical_url`);
--> statement-breakpoint
CREATE TRIGGER `adjudication_integrity` BEFORE INSERT ON `adjudications` BEGIN
  SELECT RAISE(ABORT, 'adjudication representation/proposition mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM representations r WHERE r.id = NEW.representation_id AND r.proposition_id = NEW.proposition_id AND r.status = 'APPROVED'
  );
  SELECT RAISE(ABORT, 'materiality must be locked before evidence search') WHERE NOT EXISTS (
    SELECT 1 FROM materiality_decisions m WHERE m.id = NEW.materiality_decision_id
      AND m.representation_id = NEW.representation_id AND m.locked_at < NEW.evidence_search_started_at
      AND m.methodology_version_id = NEW.methodology_version_id AND (m.tier <> 'NOT_MATERIAL' OR NEW.state = 'CHECKING')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `adjudication_evidence_integrity` BEFORE INSERT ON `adjudication_evidence` BEGIN
  SELECT RAISE(ABORT, 'evidence proposition mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM adjudications a JOIN proposition_evidence pe ON pe.id = NEW.proposition_evidence_id
    WHERE a.id = NEW.adjudication_id AND a.proposition_id = pe.proposition_id
  );
END;
--> statement-breakpoint
CREATE TRIGGER `publication_integrity` BEFORE INSERT ON `publications` BEGIN
  SELECT RAISE(ABORT, 'publication requires matching approved review') WHERE NOT EXISTS (
    SELECT 1 FROM reviews r WHERE r.id = NEW.approved_review_id AND r.adjudication_id = NEW.adjudication_id
      AND r.decision = 'APPROVED' AND r.created_at <= NEW.published_at
  );
  SELECT RAISE(ABORT, 'rated publication requires documented bilateral evidence searches') WHERE EXISTS (
    SELECT 1 FROM adjudications a WHERE a.id = NEW.adjudication_id AND a.state = 'RATED'
      AND (trim(a.supporting_search) = '' OR trim(a.contrary_search) = '')
  );
  SELECT RAISE(ABORT, 'rated publication requires considered evidence') WHERE EXISTS (
    SELECT 1 FROM adjudications a WHERE a.id = NEW.adjudication_id AND a.state = 'RATED'
  ) AND NOT EXISTS (
    SELECT 1 FROM adjudication_evidence ae WHERE ae.adjudication_id = NEW.adjudication_id
  );
END;
--> statement-breakpoint
CREATE TRIGGER `representations_protect_reviewed` BEFORE UPDATE ON `representations` WHEN EXISTS (
  SELECT 1 FROM materiality_decisions m WHERE m.representation_id = OLD.id
) OR EXISTS (SELECT 1 FROM adjudications a WHERE a.representation_id = OLD.id) BEGIN
  SELECT RAISE(ABORT, 'locked representation cannot be modified');
END;
--> statement-breakpoint
CREATE TRIGGER `representations_protect_delete` BEFORE DELETE ON `representations` WHEN EXISTS (
  SELECT 1 FROM materiality_decisions m WHERE m.representation_id = OLD.id
) OR EXISTS (SELECT 1 FROM adjudications a WHERE a.representation_id = OLD.id) BEGIN
  SELECT RAISE(ABORT, 'locked representation cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER `source_communications_immutable_update` BEFORE UPDATE ON `source_communications` BEGIN SELECT RAISE(ABORT, 'append a new source communication'); END;
--> statement-breakpoint
CREATE TRIGGER `source_communications_immutable_delete` BEFORE DELETE ON `source_communications` BEGIN SELECT RAISE(ABORT, 'source communication is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `source_captures_immutable_update` BEFORE UPDATE ON `source_captures` BEGIN SELECT RAISE(ABORT, 'source capture is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `source_captures_immutable_delete` BEFORE DELETE ON `source_captures` BEGIN SELECT RAISE(ABORT, 'source capture is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `materiality_decisions_immutable_update` BEFORE UPDATE ON `materiality_decisions` BEGIN SELECT RAISE(ABORT, 'locked materiality is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `materiality_decisions_immutable_delete` BEFORE DELETE ON `materiality_decisions` BEGIN SELECT RAISE(ABORT, 'locked materiality is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `adjudications_immutable_update` BEFORE UPDATE ON `adjudications` BEGIN SELECT RAISE(ABORT, 'append a new adjudication revision'); END;
--> statement-breakpoint
CREATE TRIGGER `adjudications_immutable_delete` BEFORE DELETE ON `adjudications` BEGIN SELECT RAISE(ABORT, 'adjudication is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `reviews_immutable_update` BEFORE UPDATE ON `reviews` BEGIN SELECT RAISE(ABORT, 'append a new review'); END;
--> statement-breakpoint
CREATE TRIGGER `reviews_immutable_delete` BEFORE DELETE ON `reviews` BEGIN SELECT RAISE(ABORT, 'review is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `publications_immutable_update` BEFORE UPDATE ON `publications` BEGIN SELECT RAISE(ABORT, 'append a correction or retraction'); END;
--> statement-breakpoint
CREATE TRIGGER `publications_immutable_delete` BEFORE DELETE ON `publications` BEGIN SELECT RAISE(ABORT, 'publication is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `corrections_immutable_update` BEFORE UPDATE ON `corrections` BEGIN SELECT RAISE(ABORT, 'append a new correction'); END;
--> statement-breakpoint
CREATE TRIGGER `corrections_immutable_delete` BEFORE DELETE ON `corrections` BEGIN SELECT RAISE(ABORT, 'correction is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `propositions_immutable_update` BEFORE UPDATE ON `propositions` BEGIN SELECT RAISE(ABORT, 'append a new proposition'); END;
--> statement-breakpoint
CREATE TRIGGER `propositions_immutable_delete` BEFORE DELETE ON `propositions` BEGIN SELECT RAISE(ABORT, 'proposition is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `evidence_objects_immutable_update` BEFORE UPDATE ON `evidence_objects` BEGIN SELECT RAISE(ABORT, 'append superseding evidence'); END;
--> statement-breakpoint
CREATE TRIGGER `evidence_objects_immutable_delete` BEFORE DELETE ON `evidence_objects` BEGIN SELECT RAISE(ABORT, 'evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `proposition_evidence_immutable_update` BEFORE UPDATE ON `proposition_evidence` BEGIN SELECT RAISE(ABORT, 'append a new applicability judgment'); END;
--> statement-breakpoint
CREATE TRIGGER `proposition_evidence_immutable_delete` BEFORE DELETE ON `proposition_evidence` BEGIN SELECT RAISE(ABORT, 'applicability judgment is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `adjudication_evidence_protect_published` BEFORE INSERT ON `adjudication_evidence` WHEN EXISTS (
  SELECT 1 FROM publications p WHERE p.adjudication_id = NEW.adjudication_id
) BEGIN SELECT RAISE(ABORT, 'published adjudication evidence is locked'); END;
--> statement-breakpoint
CREATE TRIGGER `adjudication_evidence_immutable_update` BEFORE UPDATE ON `adjudication_evidence` BEGIN SELECT RAISE(ABORT, 'considered evidence is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `adjudication_evidence_immutable_delete` BEFORE DELETE ON `adjudication_evidence` BEGIN SELECT RAISE(ABORT, 'considered evidence is immutable'); END;
